const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const logger = require("../config/logger");
const qrcode_terminal = require("qrcode-terminal");

let instance = null;

/**
 * Creates an SSE-formatted chunk for streaming responses.
 * @param {string} streamId - The unique ID of the stream.
 * @param {string} previousContent - The content sent in previous chunks.
 * @param {string} currentContent - The full current content of the message.
 * @param {boolean} [isFinal=false] - Whether this is the final chunk.
 * @returns {string} - The SSE-formatted string (e.g., "data: {...}\n\n").
 */
function createStreamChunk(streamId, previousContent, currentContent, isFinal = false) {
  let contentToSend;
  if (!isFinal) {
    // Calculate the new content by taking the substring from the end of previousContent
    contentToSend = currentContent.substring(previousContent.length);
  }
  const chunk = {
    id: streamId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "meta-ai-whatsapp",
    choices: [{
      index: 0,
      delta: isFinal ? {} : { content: contentToSend },
      finish_reason: isFinal ? "stop" : null
    }]
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

class WhatsAppService {
  constructor() {
    if (instance) return instance;
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-meta-ai",
        dataPath: "./auth_data", // Store auth data in project directory
      }),
      puppeteer: {
        headless: true, // Keep headless true for production
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
        ],
      },
    });
    this.metaAIChat = null;
    this.isReady = false;
    this.qrCodeUrl = null;
    this.messageStreams = new Map();
    this.currentStreamId = null;
    this.DEBOUNCE_TIME = 3000; // 3 seconds debounce
    this.pendingMessages = new Map(); // To store promises for sent messages
    this.isMetaAIReady = false;
    this.initializationStatus = {
      clientInitialized: false,
      metaAIChatFound: false,
      listenersSetup: false,
    };
    this.pendingStreams = [];
    this.initializationPromise = null;
    this.lastInitializationTime = null;
    instance = this;
    return instance;
  }

  static getInstance() {
    if (!instance) {
      instance = new WhatsAppService();
    }
    return instance;
  }

  async initialize(onlyQrCode = false) {
    // Add initialization promise tracking
    if (this.initializationPromise) {
      logger.info("Waiting for existing initialization...");
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise((resolve, reject) => {
      // Add restoration check
      if (this.client.pupPage && this.isFullyReady()) {
        logger.info("Restoring existing session...");
        resolve();
        return;
      }

      // Add loading event
      this.client.on("loading_screen", (percent, message) => {
        logger.info(`Loading WhatsApp: ${percent}% - ${message}`);
      });

      // Add authenticated event
      this.client.on("authenticated", () => {
        logger.info("WhatsApp authenticated successfully!");
      });

      this.client.on("qr", async (qr) => {
        logger.info("New QR code generated - authentication required");
        this.qrCodeUrl = await qrcode.toDataURL(qr);
        qrcode_terminal.generate(qr, { small: true });
        if (onlyQrCode) {
          resolve();
        }
      });

      // Add error handler
      this.client.on("error", (error) => {
        logger.error("WhatsApp client error:", error);
        // Don't reject here, just log the error
      });

      this.client.on("ready", async () => {
        try {
          logger.info("WhatsApp client is ready!");
          this.isReady = true;
          this.initializationStatus.clientInitialized = true;

          // Add retry logic for finding Meta AI chat
          let retryCount = 0;
          const maxRetries = 3;
          while (retryCount < maxRetries && !this.metaAIChat) {
            try {
              this.metaAIChat = await this.findMetaAIChat();
              this.initializationStatus.metaAIChatFound = true;
              break;
            } catch (error) {
              retryCount++;
              logger.warn(`Attempt ${retryCount} to find Meta AI chat failed`);
              await new Promise((r) => setTimeout(r, 2000));
            }
          }

          if (!this.metaAIChat) {
            throw new Error("Failed to find Meta AI chat after multiple attempts");
          }

          await this.setupMessageListeners();
          this.initializationStatus.listenersSetup = true;
          this.isMetaAIReady = true;
          this.lastInitializationTime = Date.now();

          logger.info("Initialization complete:", this.getInitializationStatus());
          resolve();
        } catch (error) {
          logger.error("Error during initialization:", error);
          this.isReady = false;
          this.isMetaAIReady = false;
          reject(error);
        }
      });

      this.client.on("disconnected", (reason) => {
        logger.warn("WhatsApp disconnected:", reason);
        this.isReady = false;
        this.isMetaAIReady = false;
        this.initializationStatus.clientInitialized = false;
        this.initializationStatus.metaAIChatFound = false;
        this.initializationStatus.listenersSetup = false;

        // Attempt to reinitialize after disconnection
        setTimeout(() => {
          logger.info("Attempting to reconnect...");
          this.client.initialize().catch((err) =>
            logger.error("Reconnection failed:", err)
          );
        }, 5000);
      });

      logger.info("Starting WhatsApp client initialization...");
      this.client.initialize().catch(reject);
    }).finally(() => {
      this.initializationPromise = null;
    });

    return this.initializationPromise;
  }

  async findMetaAIChat() {
    const chats = await this.client.getChats();
    const metaAIChat = chats.find(
      (chat) =>
        chat.name === "Meta AI" ||
        chat.id.user.includes("meta.ai") ||
        chat.id._serialized.includes("meta.ai")
    );
    if (!metaAIChat) {
      throw new Error("Meta AI chat not found.");
    }
    logger.info("Meta AI chat located:", {
      name: metaAIChat.name,
      id: metaAIChat.id._serialized,
    });
    return metaAIChat;
  }

  async setupMessageListeners() {
    const metaAIChatId = this.metaAIChat.id._serialized;
    let finalMessageReceived = false;

    const processStreamCompletion = async (streamId, msg, stream = null) => {
      const messageStream = this.messageStreams.get(streamId);
      if (!messageStream || messageStream.isComplete) return;

      const content = msg.type === "chat" ? messageStream.body : "[Media content received]";
      
      messageStream.isComplete = true;
      finalMessageReceived = true;

      if (stream) {
        try {
          const finalChunkData = createStreamChunk(streamId, messageStream.sentContent, messageStream.body, true);
          stream.write(finalChunkData);
          stream.write('data: [DONE]\n\n');
          stream.end();
          stream.end();
          logger.info(`Stream ${streamId} completed and ended`);
        } catch (error) {
          logger.error(`Error writing to stream ${streamId}:`, error);
        }
      } else {
        // For REST API, resolve immediately with final content
        messageStream.resolve({ 
          content: content,
          type: msg.type 
        });
        logger.info(`REST API response completed for ${streamId} with content:`, content);
      }

      clearTimeout(messageStream.completionTimer);
      this.messageStreams.delete(streamId);
      this.currentStreamId = null;
      await this.metaAIChat.sendSeen();
    };

    this.client.on("message_create", async (msg) => {
      if (msg.from !== metaAIChatId && msg.to !== metaAIChatId) return;

      if (msg.fromMe) {
        logger.info(`User sent: ${msg.body || "[Media sent]"}`);
      } else if (msg._data.subtype === "bot_typing_placeholder") {
        logger.info("Meta AI is typing...");
      } else {
        const streamId = msg.id.id;
        this.currentStreamId = streamId;

        if (!this.messageStreams.has(streamId)) {
          const stream = this.pendingStreams.length > 0 ? this.pendingStreams[0] : null;
          
          const messageData = {
            body: msg.body || "",
            isComplete: false,
            lastEditTimestamp: Date.now(),
            timeoutId: null,
            stream: stream,
            sentContent: "",
            completionTimer: null
          };

          // Set completion timer for both streaming and REST
          messageData.completionTimer = setTimeout(() => {
            if (!messageData.isComplete) {
              processStreamCompletion(streamId, { type: 'chat', body: messageData.body }, stream);
            }
          }, this.DEBOUNCE_TIME * 2);

          const promise = new Promise((resolve, reject) => {
            messageData.resolve = resolve;
            messageData.reject = reject;
          });

          this.messageStreams.set(streamId, messageData);
          this.pendingMessages.set(streamId, promise);

          // Handle initial message for streaming
          if (stream && msg.body) {
            const initialChunkData = createStreamChunk(streamId, "", msg.body);
            stream.write(initialChunkData);
            messageData.sentContent = msg.body;
          }
        }
      }
    });

    this.client.on("message_edit", async (msg) => {
      if (msg.from !== metaAIChatId || msg.fromMe) return;

      const streamId = msg.id.id;
      if (!this.messageStreams.has(streamId) || !this.currentStreamId) return;

      const messageStream = this.messageStreams.get(streamId);
      if (messageStream.isComplete) return;

      messageStream.body = msg.body || "";
      messageStream.lastEditTimestamp = Date.now();

      if (messageStream.stream) {
        // Handle streaming response
        try {
          // Use the utility function to create the chunk
          const chunkData = createStreamChunk(
            streamId,
            messageStream.sentContent,
            messageStream.body
          );
          messageStream.stream.write(chunkData);
          messageStream.sentContent = messageStream.body; // Update sent content
          logger.info(`Stream chunk sent for ${streamId}`);
        } catch (error) {
          logger.error(`Error sending stream chunk for ${streamId}:`, error);
        }
      }

      // Reset completion timer
      if (messageStream.completionTimer) {
        clearTimeout(messageStream.completionTimer);
      }

      messageStream.completionTimer = setTimeout(() => {
        if (!messageStream.isComplete) {
          processStreamCompletion(streamId, msg, messageStream.stream);
        }
      }, this.DEBOUNCE_TIME);
    });
  }

  isFullyReady() {
    return (
      this.isReady &&
      this.isMetaAIReady &&
      this.metaAIChat !== null &&
      this.initializationStatus.clientInitialized &&
      this.initializationStatus.metaAIChatFound &&
      this.initializationStatus.listenersSetup
    );
  }

  getInitializationStatus() {
    return {
      ...this.initializationStatus,
      isReady: this.isReady,
      isMetaAIReady: this.isMetaAIReady,
      hasMetaAIChat: this.metaAIChat !== null,
    };
  }

  async sendMessage(message, stream = null) {
    // Wait for initialization if needed
    if (!this.isFullyReady()) {
      logger.info("Service not ready, waiting for initialization...");
      try {
        await this.initialize();
      } catch (error) {
        logger.error("Initialization failed:", error);
        throw new Error("Failed to initialize WhatsApp service: " + error.message);
      }
    }

    // Add safety check after initialization
    if (!this.isFullyReady() || !this.metaAIChat) {
      const status = this.getInitializationStatus();
      logger.error("Service still not ready after initialization:", status);
      throw new Error("WhatsApp service failed to initialize properly");
    }

    if (stream) {
      logger.info("Stream mode enabled for message");
      this.pendingStreams = [stream]; // Reset pending streams to only current stream
    }

    const pupPage = this.client.pupPage;
    if (!pupPage) {
      throw new Error("Puppeteer page instance not available.");
    }

    await this.client.interface.openChatWindow(this.metaAIChat.id._serialized);
    await this.client.interface.closeRightDrawer();
    await pupPage.evaluate(() => {
      const sideDrawer = document.querySelector("#side");
      if (sideDrawer) {
        sideDrawer.parentElement.style.display = "none";
      }
    });

    const inputSelector = "div[role=textbox][aria-activedescendant]";
    await pupPage.waitForSelector(inputSelector, { timeout: 5000 });
    const inputField = await pupPage.$(inputSelector);
    if (!inputField) {
      throw new Error("Chat input field not found.");
    }
    await inputField.focus();
    for (const char of message) {
      const randomDelay = 50 + Math.random() * 100;
      await pupPage.keyboard.type(char, { delay: randomDelay });
    }
    await pupPage.keyboard.press("Enter");

    // Wait for the message_create event to create the stream
    let attempts = 0;
    const maxAttempts = 50; // Wait up to 5 seconds (50 * 100ms)
    while (!this.currentStreamId && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!this.currentStreamId) {
      throw new Error("Failed to receive message_create event from WhatsApp.");
    }

    const streamId = this.currentStreamId;
    const promise = this.pendingMessages.get(streamId);
    if (!promise) {
      throw new Error("No promise found for stream ID: " + streamId);
    }

    try {
      const response = await promise;
      this.pendingMessages.delete(streamId);
      return response;
    } catch (error) {
      this.pendingMessages.delete(streamId);
      throw error;
    }
  }

  async logout() {
    if (this.isReady) {
      await this.client.destroy();
      this.isReady = false;
      this.metaAIChat = null;
      this.qrCodeUrl = null;
      logger.info("WhatsApp client logged out successfully.");
    }
  }

  getQRCodeUrl() {
    return this.qrCodeUrl;
  }

  isClientReady() {
    return this.isReady;
  }
}

// Export a singleton instance
module.exports = WhatsAppService.getInstance();

const whatsappService = require('../services/whatsappService');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

async function createChatCompletion(req, res) {
  const { messages, stream = false } = req.body;
  const userMessage = messages[messages.length - 1].content;

  try {
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Add error handler for the response stream
      res.on('error', (error) => {
        logger.error('Response stream error:', error);
        if (!res.finished) res.end();
      });

      // Handle client disconnect
      req.on('close', () => {
        logger.info('Client closed connection');
        if (!res.finished) res.end();
      });

      await whatsappService.sendMessage(userMessage, res);
    } else {
      const response = await whatsappService.sendMessage(userMessage);
      
      if (!response || !response.content) {
        throw new Error('Invalid response from WhatsApp service');
      }

      const completionResponse = {
        id: uuidv4(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "meta-ai-whatsapp",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: response.content
          },
          finish_reason: "stop"
        }],
        usage: {
          prompt_tokens: userMessage.length,
          completion_tokens: response.content.length,
          total_tokens: userMessage.length + response.content.length
        }
      };

      res.json(completionResponse);
    }
  } catch (error) {
    logger.error('Chat completion error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          status: 500,
          message: error.message || 'Internal server error'
        }
      });
    }
  }
}

module.exports = {
  createChatCompletion
};

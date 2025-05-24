require("dotenv").config();
const app = require("./app");
const logger = require("./config/logger");
const whatsappService = require("./services/whatsappService");

const PORT = process.env.PORT || 3000;

async function initializeServices() {
  try {
    await whatsappService.initialize();
    logger.info("WhatsApp service initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize WhatsApp service:", error);
    // Continue running the server even if WhatsApp fails to initialize
  }
}

const server = app.listen(PORT, async () => {
  logger.info(`Server is running on port ${PORT}`);
  await initializeServices();
});

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down server...");
  await whatsappService.logout();
  server.close(() => {
    logger.info("Server shut down successfully.");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

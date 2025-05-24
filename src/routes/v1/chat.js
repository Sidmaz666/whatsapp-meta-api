const express = require("express");
const router = express.Router();
const { createChatCompletion } = require("../../controllers/chatController");
const whatsappService = require("../../services/whatsappService");
const logger = require("../../config/logger");

router.post("/completions", async (req, res) => {
  try {
    if (!whatsappService.isFullyReady()) {
      return res.status(400).json({
        error: {
          status: 400,
          message: "WhatsApp client is not fully initialized or Meta AI chat is not available.",
        },
      });
    }
    await createChatCompletion(req, res);
  } catch (error) {
    logger.error("Chat completion error:", error);
    // Only send error if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        error: { status: 500, message: error.message }
      });
    }
  }
});

module.exports = router;

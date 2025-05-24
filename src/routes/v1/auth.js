const express = require("express");
const router = express.Router();
const whatsappService = require("../../services/whatsappService");
const logger = require("../../config/logger");

router.post("/login", async (req, res) => {
  try {
    if (whatsappService.isClientReady()) {
      return res.status(200).json({
        message: "Client is already logged in.",
        qr_code_url: null,
      });
    }

    await whatsappService.initialize(true);
    const qrCodeUrl = whatsappService.getQRCodeUrl();
    console.log({qrCodeUrl})

    res.status(200).json({
      message: "QR code generated. Please scan to log in.",
      qr_code_url: qrCodeUrl,
    });
  } catch (error) {
    logger.error("Login error:", error.message);
    res.status(500).json({
      error: {
        status: 500,
        message: "Failed to initialize WhatsApp client.",
        details: error.message,
      },
    });
  }
});

router.post("/logout", async (req, res) => {
  try {
    await whatsappService.logout();
    res.status(200).json({
      message: "Logged out successfully.",
    });
  } catch (error) {
    logger.error("Logout error:", error.message);
    res.status(500).json({
      error: {
        status: 500,
        message: "Failed to log out.",
        details: error.message,
      },
    });
  }
});

module.exports = router;

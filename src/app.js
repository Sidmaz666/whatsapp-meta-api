const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const rateLimiter = require("./middleware/rateLimiter");
const validateRequest = require("./middleware/validateRequest");
const logger = require("./config/logger");

const app = express();

// Middleware
app.use(express.json());
app.use(rateLimiter);
app.use(validateRequest);

// Swagger Documentation
const swaggerDocument = YAML.load(path.join(__dirname, "swagger/swagger.yaml"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use("/v1/auth", require("./routes/v1/auth"));
app.use("/v1/chat", require("./routes/v1/chat"));
app.use("/v1/health", require("./routes/v1/health"));

// Error Handling
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err.message);
  res.status(500).json({
    error: {
      status: 500,
      message: "Internal server error.",
      details: err.message,
    },
  });
});

module.exports = app;

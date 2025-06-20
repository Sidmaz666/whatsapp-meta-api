const rateLimit = require("express-rate-limit");

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: {
      status: 429,
      message: "Too many requests, please try again later.",
    },
  },
});

module.exports = rateLimiter;

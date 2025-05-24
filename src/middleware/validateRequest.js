const validateRequest = (req, res, next) => {
  if (req.path === "/v1/chat/completions") {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          status: 400,
          message: "Invalid request: 'messages' must be a non-empty array.",
        },
      });
    }
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.role || !lastMessage.content || lastMessage.role !== "user") {
      return res.status(400).json({
        error: {
          status: 400,
          message:
            "Invalid request: The last message must have 'role' as 'user' and a 'content' field.",
        },
      });
    }
  }
  next();
};

module.exports = validateRequest;

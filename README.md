# WhatsApp Meta AI API

An API that allows you to interact with Meta AI through WhatsApp, following OpenAI API standards. This project enables you to communicate with Meta AI using a REST API interface, supporting both standard HTTP requests and server-sent events (SSE) for streaming responses.

## Features

- 🚀 OpenAI-compatible API endpoints
- 📱 WhatsApp Web integration
- 🔄 Streaming responses support
- 📊 Swagger documentation
- 🔒 Authentication via WhatsApp QR code
- ⚡ Rate limiting protection
- 📝 Comprehensive logging

## Prerequisites

- Node.js 16+ installed
- A WhatsApp account
- Chrome/Chromium browser (for WhatsApp Web automation)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/whatsapp-meta-ai-api.git
cd whatsapp-meta-ai-api
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=development
```

## Starting the Server

1. Development mode with hot reload:
```bash
npm run dev
```

## Authentication Flow

1. When you first start the server, you need to authenticate with WhatsApp:

2. Make a POST request to `/v1/login`:
```bash
curl -X POST http://localhost:3000/v1/login
```

3. You'll receive a QR code URL in the response and in the `terminal`. Scan this QR code with your WhatsApp mobile app to authenticate.

4. The server will automatically find the Meta AI chat in your WhatsApp contacts.

## API Endpoints

### 1. Authentication

#### Login
- **POST** `/v1/login`
- Generates QR code for WhatsApp authentication
- Response: `{ message: string, qr_code_url: string }`

#### Logout
- **POST** `/v1/logout`
- Disconnects WhatsApp session
- Response: `{ message: string }`

### 2. Chat Completion

#### Standard Request
- **POST** `/v1/chat/completions`
- Body:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ]
}
```

#### Streaming Request
- Pass `stream:true` in body
- Receives Server-Sent Events (SSE) responses
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
        "messages":[{"role":"user","content":"Tell me a story"}],
        "stream": true
    }'
```

### 3. Health Check
- **GET** `/v1/health`
- Checks API status
- Response: `{ status: string, message: string }`

## API Documentation

Access the Swagger documentation at:
```
http://localhost:3000/api-docs
```

## Architecture

```
src/
├── app.js           # Express application setup
├── server.js        # Server initialization
├── config/         
│   └── logger.js    # Winston logger configuration
├── middleware/
│   ├── rateLimiter.js     # Rate limiting
│   └── validateRequest.js  # Request validation
├── routes/
│   └── v1/              
│       ├── auth.js        # Authentication routes
│       ├── chat.js        # Chat completion routes
│       └── health.js      # Health check routes
├── services/
│   └── whatsappService.js # WhatsApp integration
└── swagger/
    └── swagger.yaml       # API documentation
```

## Best Practices

1. Always handle the WhatsApp session properly:
   - Initialize before making requests
   - Logout when shutting down

2. Implement error handling in your client:
   - Handle connection errors
   - Implement retry logic
   - Monitor rate limits

3. For streaming responses:
   - Implement proper SSE handling
   - Handle connection timeouts
   - Process chunks appropriately

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to the branch
5. Create a Pull Request
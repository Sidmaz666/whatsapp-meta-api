const request = require('supertest');
const app = require('../app');
const whatsappService = require('../services/whatsappService');
const logger = require('../config/logger');

jest.setTimeout(120000); // 2 minutes timeout

describe('WhatsApp Meta AI Service Tests', () => {
  beforeAll(async () => {
    // Mock WhatsApp service for testing
    jest.spyOn(whatsappService, 'initialize').mockImplementation(async () => {
      whatsappService.isReady = true;
      whatsappService.qrCodeUrl = 'data:image/png;base64,mock-qr-code';
      return Promise.resolve();
    });

    jest.spyOn(whatsappService, 'isClientReady').mockImplementation(() => true);
    jest.spyOn(whatsappService, 'sendMessage').mockImplementation(async () => ({
      content: 'Mock response from Meta AI',
      type: 'chat'
    }));
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  describe('Authentication Flow', () => {
    it('should generate QR code for login', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('qr_code_url');
      expect(response.body.qr_code_url).toMatch(/^data:image\/png;base64,/);
    });

    it('should handle logout successfully', async () => {
      const response = await request(app)
        .post('/v1/auth/logout')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Logged out successfully.');
    });
  });

  describe('Chat Completion', () => {
    it('should process chat completion request', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            {
              role: 'user',
              content: 'Hello, how are you?'
            }
          ]
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body).toHaveProperty('created');
      expect(response.body).toHaveProperty('model', 'meta-ai-whatsapp');
      expect(response.body.choices).toHaveLength(1);
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty('role', 'assistant');
      expect(response.body.choices[0].message).toHaveProperty('content');
      expect(response.body.usage).toHaveProperty('prompt_tokens');
      expect(response.body.usage).toHaveProperty('completion_tokens');
      expect(response.body.usage).toHaveProperty('total_tokens');
    });

    it('should handle invalid message format', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [] // Empty messages array
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('status', 400);
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle service unavailability', async () => {
      // Mock service unavailability
      jest.spyOn(whatsappService, 'isClientReady').mockImplementationOnce(() => false);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            {
              role: 'user',
              content: 'Hello'
            }
          ]
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('status', 400);
      expect(response.body.error.message).toContain('not logged in');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = Array(101).fill().map(() => 
        request(app)
          .post('/v1/chat/completions')
          .send({
            messages: [
              {
                role: 'user',
                content: 'Test message'
              }
            ]
          })
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find(res => res.status === 429);

      expect(rateLimitedResponse).toBeDefined();
      expect(rateLimitedResponse.body.error).toHaveProperty('status', 429);
      expect(rateLimitedResponse.body.error.message).toContain('Too many requests');
    });
  });
}); 
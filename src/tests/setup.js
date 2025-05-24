require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for WhatsApp initialization
jest.setTimeout(30000);

// Mock logger to prevent console output during tests
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
})); 
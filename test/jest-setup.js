// This file contains global setup for Jest tests
// It handles test timeouts and module mocking

// Set global Jest timeout to 10 seconds
jest.setTimeout(10000);

// Mock the brotli module to prevent ASM.js errors
jest.mock('brotli', () => ({
  compress: jest.fn().mockImplementation(() => Buffer.from([])),
  decompress: jest.fn().mockImplementation(() => Buffer.from([])),
  isCompressed: jest.fn().mockReturnValue(false),
}));

// This prevents the error: process.exit called with "2"
jest.mock('@oclif/core/lib/errors/handle', () => ({
  handle: jest.fn(),
}));

console.log('Jest test environment configured with global mocks and settings');
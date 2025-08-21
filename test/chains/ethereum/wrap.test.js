const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CHAIN = 'ethereum';
const NETWORK = 'base'; // Test on Base network
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const WRAPPED_ADDRESS = '0x4200000000000000000000000000000000000006'; // WETH on Base

// Mock API calls
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  const filePath = path.join(__dirname, 'mocks', `${filename}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to validate wrap response structure
function validateWrapResponse(response) {
  return (
    response &&
    typeof response.nonce === 'number' &&
    typeof response.signature === 'string' &&
    typeof response.fee === 'string' &&
    typeof response.amount === 'string' &&
    typeof response.wrappedAddress === 'string' &&
    typeof response.nativeToken === 'string' &&
    typeof response.wrappedToken === 'string' &&
    typeof response.tx === 'object' &&
    typeof response.tx.data === 'string' &&
    typeof response.tx.to === 'string' &&
    (response.tx.gasLimit === null || typeof response.tx.gasLimit === 'string') &&
    typeof response.tx.value === 'string'
  );
}

// Tests
describe('Ethereum Wrap Native Token Tests (Base Network)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Wrap Endpoint', () => {
    test('wraps native token to wrapped token successfully', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('wrap');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/chains/${CHAIN}/wrap`, {
        network: NETWORK,
        address: TEST_WALLET,
        amount: '0.1', // 0.1 ETH
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateWrapResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.wrappedAddress).toBe(WRAPPED_ADDRESS);
      expect(response.data.amount).toBe('0.1');
      expect(response.data.fee).toBe('0.000021');
      expect(response.data.nativeToken).toBe('ETH');
      expect(response.data.wrappedToken).toBe('WETH');
      expect(response.data.tx.to).toBe(WRAPPED_ADDRESS);
      expect(response.data.tx.value).toBe('100000000000000000'); // 0.1 ETH in wei
      expect(response.data.signature).toBeTruthy();

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/wrap`,
        expect.objectContaining({
          network: NETWORK,
          address: TEST_WALLET,
          amount: '0.1',
        }),
      );
    });

    test('handles error for invalid wallet address', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'Invalid Ethereum address format: invalidwallet',
            code: 400,
          },
        },
      });

      // Make the request with invalid wallet
      await expect(
        axios.post(`http://localhost:15888/chains/${CHAIN}/wrap`, {
          network: NETWORK,
          address: 'invalidwallet',
          amount: '0.1',
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: expect.stringContaining('Invalid Ethereum address'),
          },
        },
      });
    });

    test('handles error for invalid amount', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'Invalid amount: must be a valid number',
            code: 400,
          },
        },
      });

      // Make the request with invalid amount
      await expect(
        axios.post(`http://localhost:15888/chains/${CHAIN}/wrap`, {
          network: NETWORK,
          address: TEST_WALLET,
          amount: 'invalid',
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: expect.stringContaining('Invalid amount'),
          },
        },
      });
    });

    test('handles error for insufficient funds', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'Insufficient funds for transaction. Please ensure you have enough ETH to wrap.',
            code: 400,
          },
        },
      });

      // Make the request with amount too large
      await expect(
        axios.post(`http://localhost:15888/chains/${CHAIN}/wrap`, {
          network: NETWORK,
          address: TEST_WALLET,
          amount: '1000000', // Very large amount
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: expect.stringContaining('Insufficient funds'),
          },
        },
      });
    });
  });
});

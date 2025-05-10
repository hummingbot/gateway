/**
 * Template for adding a new chain test
 *
 * Instructions:
 * 1. Copy this file to test/chains/yourchain.test.js
 * 2. Replace placeholders with your chain-specific values
 * 3. Create required mock files in test/mocks/chains/yourchain/
 * 4. Update validation functions if needed for your chain-specific response formats
 */

const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file - UPDATE THESE FOR YOUR CHAIN
const CHAIN = 'yourchain'; // Chain name used in API paths
const NETWORK = 'yournetwork'; // Default network to test
const TEST_WALLET = 'your-test-wallet-address';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Helper to load mock responses
function loadMockResponse(filename) {
  const filePath = path.join(
    __dirname,
    '..',
    'mocks',
    'chains',
    CHAIN,
    `${filename}.json`,
  );
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to validate balance response structure - UPDATE IF NEEDED
function validateBalanceResponse(response) {
  return (
    response &&
    typeof response.network === 'string' &&
    typeof response.wallet === 'string' &&
    Array.isArray(response.balances) &&
    response.balances.every(
      (balance) =>
        typeof balance.symbol === 'string' &&
        typeof balance.address === 'string' &&
        typeof balance.decimals === 'number' &&
        typeof balance.name === 'string' &&
        typeof balance.balance === 'string',
    )
  );
}

// Function to validate tokens response structure - UPDATE IF NEEDED
function validateTokensResponse(response) {
  return (
    response &&
    typeof response.network === 'string' &&
    Array.isArray(response.tokens) &&
    response.tokens.every(
      (token) =>
        typeof token.symbol === 'string' &&
        typeof token.address === 'string' &&
        typeof token.decimals === 'number' &&
        typeof token.name === 'string',
    )
  );
}

// Function to validate status response structure - UPDATE IF NEEDED
function validateStatusResponse(response) {
  return (
    response &&
    typeof response.network === 'string' &&
    typeof response.isConnected === 'boolean' &&
    (response.chainId === undefined || typeof response.chainId === 'number') &&
    (response.latestBlock === undefined ||
      typeof response.latestBlock === 'number') &&
    (response.gasPrice === undefined ||
      typeof response.gasPrice === 'string') &&
    (response.nativeCurrency === undefined ||
      (typeof response.nativeCurrency.name === 'string' &&
        typeof response.nativeCurrency.symbol === 'string' &&
        typeof response.nativeCurrency.decimals === 'number'))
  );
}

// Tests
describe(`${CHAIN} Chain Tests (${NETWORK} Network)`, () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockReset();
    axios.post.mockReset();
  });

  describe('Balance Endpoint', () => {
    test('returns and validates wallet balances', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('balance');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        {
          params: {
            network: NETWORK,
            wallet: TEST_WALLET,
            // Add your chain's token symbols here
            tokenSymbols: ['TOKEN1', 'TOKEN2', 'TOKEN3'],
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateBalanceResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.wallet).toBe(TEST_WALLET);
      expect(response.data.balances.length).toBeGreaterThanOrEqual(1);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            wallet: TEST_WALLET,
          }),
        }),
      );
    });

    test('handles error response for invalid wallet', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'Invalid wallet address',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/chains/${CHAIN}/balances`, {
          params: {
            network: NETWORK,
            wallet: 'invalidwallet',
            tokenSymbols: ['TOKEN1'],
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'Invalid wallet address',
          },
        },
      });
    });
  });

  describe('Tokens Endpoint', () => {
    test('returns and validates token list', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('tokens');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/chains/${CHAIN}/tokens`,
        {
          params: {
            network: NETWORK,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateTokensResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.tokens.length).toBeGreaterThanOrEqual(1);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/tokens`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
          }),
        }),
      );
    });
  });

  describe('Status Endpoint', () => {
    test('returns and validates chain status', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('status');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/chains/${CHAIN}/status`,
        {
          params: {
            network: NETWORK,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateStatusResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.isConnected).toBe(true);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/status`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
          }),
        }),
      );
    });
  });

  // Add additional endpoints specific to your chain here
});

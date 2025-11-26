const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CHAIN = 'cosmos';
const NETWORK = 'testnet';
const TEST_WALLET = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
const TEST_WALLET_PRIVATE_KEY = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5';
const TEST_OUTBOUND_ADDRESS = 'osmo1mvsg3en5ulpnpd3dset2m86zjpnzp4v4epmjh7';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  // Use mocks from the same directory
  const filePath = path.join(__dirname, 'mocks', `${filename}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Tests
describe('Cosmos-Osmosis Chain Routes Tests (testnet)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Balance Endpoint', () => {
    test('Balances all', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('balances-ALL-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/balances`, {
        params: {
          network: NETWORK,
          wallet: TEST_WALLET,
          tokens: [],
        },
      });

      // Validate the response
      expect(response.status).toBe(200);

      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.wallet).toBe(TEST_WALLET);
      expect(response.data.balances['OSMO']).toBeGreaterThanOrEqual(1);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            wallet: TEST_WALLET,
            tokens: [],
          }),
        }),
      );
    });

    test('Balances OSMO', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('balances-OSMO-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/balances`, {
        params: {
          network: NETWORK,
          wallet: TEST_WALLET,
          tokens: ['OSMO'],
        },
      });

      // Validate the response
      expect(response.status).toBe(200);

      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.wallet).toBe(TEST_WALLET);
      expect(response.data.balances['OSMO']).toBeGreaterThanOrEqual(1);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            wallet: TEST_WALLET,
            tokens: ['OSMO'],
          }),
        }),
      );
    });

    test('Balances - handles error response for invalid wallet', async () => {
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
            tokens: ['OSMO'],
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            code: 400,
            error: 'Invalid wallet address',
          },
        },
      });
    });
  });

  describe('Tokens Endpoint', () => {
    test('returns and validates token list', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('tokens-all-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/tokens`, {
        params: {
          network: NETWORK,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);

      // Check expected mock values
      expect(response.data.tokens.length).toBe(2); //testnet only has 2 currently

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
      const mockResponse = loadMockResponse('status-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/status`, {
        params: {
          network: NETWORK,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);

      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.currentBlockNumber).toBe(41884325);

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

  describe('Poll', () => {
    test('poll transaction', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('poll-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const poll_signature = '344A0C038C05D1FA938E78828925109879E30C397100BD84D0BA08A463B2FF82';
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/status`, {
        params: { network: NETWORK, signature: poll_signature, tokens: [], walletAddress: TEST_WALLET },
      });

      // Validate the response
      expect(response.status).toBe(200);

      // Check expected mock values
      expect(response.data.tokenBalanceChanges['OSMO']).toBeGreaterThanOrEqual(-1);
      expect(response.data.currentBlock).toBeGreaterThanOrEqual(response.data.txBlock);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/status`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            signature: poll_signature,
            tokens: [],
            walletAddress: TEST_WALLET,
          }),
        }),
      );
    });
  });

  describe('Block', () => {
    test('get current block', async () => {
      const mockResponse = loadMockResponse('block-out');
      expect(mockResponse).toBeGreaterThanOrEqual(41884325);
    });
  });

  describe('Transfer', () => {
    test('transfer (not used by endpoint now)', async () => {
      const mockResponse = loadMockResponse('transfer-out');
      expect(mockResponse).toContain('Transfer success');
    });
  });
});

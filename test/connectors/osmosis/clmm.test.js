const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const PROTOCOL = 'clmm';
const CONNECTOR = 'osmosis';
const NETWORK = 'testnet';
const BASE_TOKEN = 'OSMO';
const QUOTE_TOKEN = 'ION';
const TEST_WALLET = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
const TEST_POOL_ID = '1269';
const TEST_POOL_ADDRESS = 'osmo1rdm79d008fel4ppkgdcf8pgjwazf72sjfhpyx5kpzlck86slpjusek2en6';

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
describe('Osmosis CLMM Tests (testnet)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Pool Info Endpoint', () => {
    test('returns and validates pool info', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('poolInfo-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL_ADDRESS,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);

      // Check expected mock values
      expect(response.data.address).toBe(TEST_POOL_ADDRESS);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            poolAddress: TEST_POOL_ADDRESS,
          }),
        }),
      );
    });

    test('handles error for non-existent pool', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'Pool not found',
            code: 404,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
          params: {
            network: NETWORK,
            poolAddress: 'UNKNOWN',
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: 'Pool not found',
          },
        },
      });
    });
  });

  describe('Positions Owned Endpoint', () => {
    test('returns and validates positions owned', async () => {
      const mockResponse = loadMockResponse('positionsOwned-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('positionsOwned-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/positions-owned`, {
        params: mockRequest,
      });

      // Validate the response
      console.info(response.data);
      expect(response.status).toBe(200);
      expect(response.data[0].baseTokenAmount).toBeGreaterThan(0);
    });
  });

  describe('Quote Swap Endpoint', () => {
    test('returns and validates swap quote for BUY', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('quoteSwap-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
        params: {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'BUY',
          amount: 0.001,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);

      // Check expected mock values
      expect(response.data.poolAddress).toBe(TEST_POOL_ID); // Osmo uses poolId for swaps
      expect(response.data.amountIn).toBeGreaterThan(1);
      expect(response.data.amountOut).toBeGreaterThan(0);

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'BUY',
            amount: 0.001,
          }),
        }),
      );
    });
  });

  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Mock a quote-swap response to use as input for execute-swap
      const executeSwapRequest = loadMockResponse('executeSwap-CLMM-in');
      const executeSwapResponse = loadMockResponse('executeSwap-CLMM-out');

      // Setup mock axios for the execute-swap request
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: executeSwapResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`, {
        network: NETWORK,
        baseToken: executeSwapRequest['baseToken'],
        quoteToken: executeSwapRequest['quoteToken'],
        side: executeSwapRequest['side'],
        amount: executeSwapRequest['amount'],
        wallet: executeSwapRequest['walletAddress'],
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.amountIn).toBe(executeSwapResponse['amountIn']);
    });

    test('handles transaction simulation error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            error: 'InternalServerError',
            message: 'Transaction simulation failed',
            code: 500,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`, {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1000000.0,
          wallet: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 500,
          data: {
            error: 'InternalServerError',
          },
        },
      });
    });
  });

  describe('Position Info Endpoint', () => {
    test('returns and validates position info', async () => {
      const mockResponse = loadMockResponse('positionInfo-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('positionInfo-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.poolAddress).toBe(TEST_POOL_ADDRESS);
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
    });
  });

  describe('Add Liquidity Endpoint', () => {
    test('returns successful liquidity addition', async () => {
      const mockResponse = loadMockResponse('addLiquidity-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('addLiquidity-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.data.quoteTokenAmountAdded).toBeGreaterThan(0);
    });
  });

  describe('Open Position Endpoint', () => {
    test('returns successful open position', async () => {
      const mockResponse = loadMockResponse('openPosition-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('openPosition-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/open-position`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.data.baseTokenAmountAdded).toBeGreaterThan(0);
    });
  });

  describe('Close Position Endpoint', () => {
    test('returns successful close position', async () => {
      const mockResponse = loadMockResponse('closePosition-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('closePosition-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/close-position`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.data.baseTokenAmountRemoved).toBeGreaterThan(0);
    });
  });

  describe('Collect Fees Endpoint', () => {
    test('returns successful collect fees', async () => {
      const mockResponse = loadMockResponse('collectFees-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('collectFees-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/collect-fees`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.data.quoteFeeAmountCollected * -1).toBeGreaterThan(0);
    });
  });

  describe('Remove Liquidity Endpoint', () => {
    test('returns successful liquidity remove', async () => {
      const mockResponse = loadMockResponse('removeLiquidity-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('removeLiquidity-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.data.baseTokenAmountRemoved).toBeGreaterThan(0);
    });
  });

  describe('fetch pools Endpoint', () => {
    test('fetch pools', async () => {
      const mockResponse = loadMockResponse('fetchPools-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('fetchPools-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/fetch-pools`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.length).toBeGreaterThan(0);
    });
  });

  describe('pool info Endpoint', () => {
    test('pool info', async () => {
      const mockResponse = loadMockResponse('poolInfo-CLMM-out');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const mockRequest = loadMockResponse('poolInfo-CLMM-in');
      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
        params: mockRequest,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
    });
  });
});

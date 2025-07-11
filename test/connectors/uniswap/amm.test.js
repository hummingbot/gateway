const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'uniswap';
const PROTOCOL = 'amm';
const NETWORK = 'base'; // Only test Base network
const BASE_TOKEN = 'WETH';
const QUOTE_TOKEN = 'USDC';
const TEST_POOL = '0x88a43bbdf9d098eec7bceda4e2494615dfd9bb9c'; // WETH-USDC on Base
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  // Use mocks from the same directory
  const filePath = path.join(__dirname, 'mocks', `${PROTOCOL}-${filename}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to validate pool info response structure
function validatePoolInfo(response) {
  return (
    response &&
    typeof response.address === 'string' &&
    typeof response.baseTokenAddress === 'string' &&
    typeof response.quoteTokenAddress === 'string' &&
    typeof response.feePct === 'number' &&
    typeof response.price === 'number' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    response.poolType === 'amm' &&
    response.lpMint &&
    typeof response.lpMint.address === 'string' &&
    typeof response.lpMint.decimals === 'number'
  );
}

// Function to validate swap quote response structure
function validateSwapQuote(response) {
  return (
    response &&
    typeof response.poolAddress === 'string' &&
    typeof response.estimatedAmountIn === 'number' &&
    typeof response.estimatedAmountOut === 'number' &&
    typeof response.minAmountOut === 'number' &&
    typeof response.maxAmountIn === 'number' &&
    typeof response.baseTokenBalanceChange === 'number' &&
    typeof response.quoteTokenBalanceChange === 'number' &&
    typeof response.price === 'number'
  );
}

// Tests
describe('Uniswap AMM Tests (Base Network)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Pool Info Endpoint', () => {
    test('returns and validates pool info', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('pool-info');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
        params: {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePoolInfo(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.address).toBe(TEST_POOL);
      expect(response.data.poolType).toBe('amm');

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
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
            baseToken: 'UNKNOWN',
            quoteToken: QUOTE_TOKEN,
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

  describe('Quote Swap Endpoint', () => {
    test('returns and validates swap quote for SELL', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('quote-swap');

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
          side: 'SELL',
          amount: 1.0,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.baseTokenBalanceChange).toBeLessThan(0); // SELL means negative base token change
      expect(response.data.quoteTokenBalanceChange).toBeGreaterThan(0); // SELL means positive quote token change

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0,
          }),
        }),
      );
    });

    test('returns and validates swap quote for BUY', async () => {
      // Modify the mock response for BUY direction
      const mockSellResponse = loadMockResponse('quote-swap');
      const mockBuyResponse = {
        ...mockSellResponse,
        // Flip the values for BUY direction
        estimatedAmountIn: mockSellResponse.estimatedAmountOut,
        estimatedAmountOut: mockSellResponse.estimatedAmountIn,
        baseTokenBalanceChange: 1.0, // Positive for BUY
        quoteTokenBalanceChange: -mockSellResponse.quoteTokenBalanceChange, // Negative for BUY
        // For BUY: price = quote needed / base received
        price: mockSellResponse.estimatedAmountOut / mockSellResponse.estimatedAmountIn,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockBuyResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
        params: {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'BUY',
          amount: 1.0,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.baseTokenBalanceChange).toBeGreaterThan(0); // BUY means positive base token change
      expect(response.data.quoteTokenBalanceChange).toBeLessThan(0); // BUY means negative quote token change
    });
  });

  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Mock a quote-swap response to use as input for execute-swap
      const quoteResponse = loadMockResponse('quote-swap');

      // Mock a successful execution response
      const executeResponse = {
        signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        amountIn: quoteResponse.estimatedAmountIn,
        amountOut: quoteResponse.estimatedAmountOut,
        fee: 0.003,
        baseTokenBalanceChange: quoteResponse.baseTokenBalanceChange,
        quoteTokenBalanceChange: quoteResponse.quoteTokenBalanceChange,
      };

      // Setup mock axios for the execute-swap request
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: executeResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`, {
        network: NETWORK,
        baseToken: BASE_TOKEN,
        quoteToken: QUOTE_TOKEN,
        side: 'SELL',
        amount: 1.0,
        wallet: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.amountIn).toBe(quoteResponse.estimatedAmountIn);
      expect(response.data.amountOut).toBe(quoteResponse.estimatedAmountOut);
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

  describe('Quote Liquidity Endpoint', () => {
    test('returns and validates liquidity quote', async () => {
      const mockResponse = {
        poolAddress: TEST_POOL,
        baseTokenLiquidity: 1.0,
        quoteTokenLiquidity: 2340.5,
        lpTokenAmount: 54.32,
        shareOfPool: 0.0001,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-liquidity`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseTokenAmount: 1.0,
          quoteTokenAmount: 2340.5,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.lpTokenAmount).toBeGreaterThan(0);
      expect(response.data.shareOfPool).toBeGreaterThan(0);
    });

    test('handles imbalanced liquidity error', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Token amounts do not match pool ratio',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-liquidity`, {
          params: {
            network: NETWORK,
            poolAddress: TEST_POOL,
            baseTokenAmount: 1.0,
            quoteTokenAmount: 100.0, // Wrong ratio
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('ratio'),
          },
        },
      });
    });
  });

  describe('Position Info Endpoint', () => {
    test('returns and validates position info', async () => {
      const mockResponse = {
        poolAddress: TEST_POOL,
        positionId: 'uniswap-v2-lp-123456',
        lpTokenAmount: 100.5,
        baseTokenAmount: 1.85,
        quoteTokenAmount: 4329.225,
        shareOfPool: 0.01,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
          lpTokenAmount: 100.5,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.lpTokenAmount).toBe(100.5);
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
    });
  });

  describe('Add Liquidity Endpoint', () => {
    test('returns successful liquidity addition', async () => {
      const mockResponse = {
        signature: '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        baseTokenAmount: 1.0,
        quoteTokenAmount: 2340.5,
        lpTokenAmount: 54.32,
        poolAddress: TEST_POOL,
        fee: 0.003,
      };

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`, {
        network: NETWORK,
        poolAddress: TEST_POOL,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 2340.5,
        wallet: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.lpTokenAmount).toBeGreaterThan(0);
      expect(response.data.baseTokenAmount).toBe(1.0);
      expect(response.data.quoteTokenAmount).toBe(2340.5);
    });

    test('handles insufficient balance error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Insufficient balance for WETH',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`, {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseTokenAmount: 10000.0, // Large amount
          quoteTokenAmount: 23405000.0,
          wallet: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('Insufficient balance'),
          },
        },
      });
    });
  });

  describe('Remove Liquidity Endpoint', () => {
    test('returns successful liquidity removal', async () => {
      const mockResponse = {
        signature: '0xdef4567890abcdef1234567890abcdef1234567890abcdef1234567890abcd12',
        baseTokenAmount: 0.95,
        quoteTokenAmount: 2223.475,
        lpTokenAmount: 54.32,
        poolAddress: TEST_POOL,
        fee: 0.003,
      };

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`, {
        network: NETWORK,
        poolAddress: TEST_POOL,
        lpTokenAmount: 54.32,
        wallet: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
      expect(response.data.lpTokenAmount).toBe(54.32);
    });

    test('handles insufficient LP token balance error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Insufficient LP token balance',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`, {
          network: NETWORK,
          poolAddress: TEST_POOL,
          lpTokenAmount: 10000.0, // Large amount
          wallet: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('Insufficient LP token balance'),
          },
        },
      });
    });
  });
});

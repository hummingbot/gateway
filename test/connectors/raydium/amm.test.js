const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'raydium';
const PROTOCOL = 'amm';
const NETWORK = 'mainnet-beta';
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const TEST_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'; // SOL-USDC Raydium AMM pool
const TEST_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  const filePath = path.join(__dirname, 'mocks', `${filename}.json`);
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

// Function to validate swap quote response structure based on GetSwapQuoteResponse schema
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
    typeof response.price === 'number' &&
    typeof response.computeUnits === 'number' // Updated to use computeUnits
  );
}

// Function to validate swap execution response structure
function validateSwapExecution(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' && // Added status field
    (response.status !== 1 || // If not CONFIRMED
      (response.data && // then data is optional
        typeof response.data.totalInputSwapped === 'number' &&
        typeof response.data.totalOutputSwapped === 'number' &&
        typeof response.data.fee === 'number' &&
        typeof response.data.baseTokenBalanceChange === 'number' &&
        typeof response.data.quoteTokenBalanceChange === 'number'))
  );
}

// Function to validate liquidity quote response
function validateLiquidityQuote(response) {
  return (
    response &&
    typeof response.baseLimited === 'boolean' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    typeof response.baseTokenAmountMax === 'number' &&
    typeof response.quoteTokenAmountMax === 'number' &&
    typeof response.computeUnits === 'number' // Added computeUnits
  );
}

// Function to validate position info response
function validatePositionInfo(response) {
  return (
    response &&
    typeof response.poolAddress === 'string' &&
    typeof response.positionId === 'string' &&
    typeof response.lpTokenAmount === 'number' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    typeof response.shareOfPool === 'number'
  );
}

// Tests
describe('Raydium AMM Tests (Solana Mainnet)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Pool Info Endpoint', () => {
    test('returns and validates pool info', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('amm-pool-info');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
        {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePoolInfo(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.address).toBe(TEST_POOL);
      expect(response.data.poolType).toBe('amm');
      expect(response.data.feePct).toBe(0.0025); // 0.25% fee

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
            error: 'NotFound',
            message: 'Pool not found for SOL-UNKNOWN',
            code: 404,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
          {
            params: {
              network: NETWORK,
              baseToken: BASE_TOKEN,
              quoteToken: 'UNKNOWN',
            },
          },
        ),
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: 'NotFound',
          },
        },
      });
    });
  });

  describe('Quote Swap Endpoint', () => {
    test('returns and validates swap quote for SELL', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('swap-quote');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`,
        {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1.0,
          },
        },
      );

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
      const mockSellResponse = loadMockResponse('swap-quote');
      const mockBuyResponse = {
        ...mockSellResponse,
        // Flip the values for BUY direction
        estimatedAmountIn: mockSellResponse.estimatedAmountOut,
        estimatedAmountOut: mockSellResponse.estimatedAmountIn,
        maxAmountIn: mockSellResponse.estimatedAmountOut * 1.01, // with slippage
        minAmountOut: mockSellResponse.estimatedAmountIn * 0.99, // with slippage
        baseTokenBalanceChange: 1.0, // Positive for BUY
        quoteTokenBalanceChange: -mockSellResponse.quoteTokenBalanceChange, // Negative for BUY
        computeUnits: 200000,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockBuyResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`,
        {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'BUY',
            amount: 1.0,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapQuote(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.poolAddress).toBe(TEST_POOL);
      expect(response.data.baseTokenBalanceChange).toBeGreaterThan(0); // BUY means positive base token change
      expect(response.data.quoteTokenBalanceChange).toBeLessThan(0); // BUY means negative quote token change
    });

    test('handles insufficient liquidity error', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Insufficient liquidity in pool for SOL-USDC',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`,
          {
            params: {
              network: NETWORK,
              baseToken: BASE_TOKEN,
              quoteToken: QUOTE_TOKEN,
              side: 'SELL',
              amount: 1000000.0, // Very large amount
            },
          },
        ),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('Insufficient liquidity'),
          },
        },
      });
    });
  });

  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Load mock response
      const executeResponse = loadMockResponse('swap-execute');

      // Setup mock axios for the execute-swap request
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: executeResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`,
        {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapExecution(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.signature).toBeDefined();
      expect(response.data.signature.length).toBeGreaterThan(80); // Solana signatures are long
      expect(response.data.status).toBe(1); // CONFIRMED
      expect(response.data.data.fee).toBeGreaterThan(0);
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
        axios.post(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`,
          {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1000000.0,
            walletAddress: TEST_WALLET,
          },
        ),
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
        baseLimited: false,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 167.5,
        baseTokenAmountMax: 1.0,
        quoteTokenAmountMax: 167.5,
        lpTokenAmount: 12.94,
        shareOfPool: 0.0001,
        computeUnits: 150000,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-liquidity`,
        {
          params: {
            network: NETWORK,
            poolAddress: TEST_POOL,
            baseTokenAmount: 1.0,
            quoteTokenAmount: 167.5,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateLiquidityQuote(response.data)).toBe(true);
      expect(response.data.shareOfPool).toBeGreaterThan(0);
    });
  });

  describe('Position Info Endpoint', () => {
    test('returns and validates position info', async () => {
      const mockResponse = loadMockResponse('amm-pool-info');
      // Add position-specific fields
      const positionResponse = {
        poolAddress: TEST_POOL,
        positionId: 'raydium-amm-lp-123456',
        lpTokenAmount: 100.5,
        baseTokenAmount: mockResponse.baseTokenAmount * 0.01,
        quoteTokenAmount: mockResponse.quoteTokenAmount * 0.01,
        shareOfPool: 0.01,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: positionResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`,
        {
          params: {
            network: NETWORK,
            poolAddress: TEST_POOL,
            lpTokenAmount: 100.5,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePositionInfo(response.data)).toBe(true);
      expect(response.data.lpTokenAmount).toBe(100.5);
    });
  });

  describe('Add Liquidity Endpoint', () => {
    test('returns successful liquidity addition', async () => {
      const mockResponse = {
        signature:
          '2ZE6KhhZTPixeNQVxjDv2LcX7VTxQN9vwMv8Z89FwqYKKQRmqPQCuwyWQMjGwUJKdRrPoKNL7Rn6fHZFvVbpS3Yw',
        baseTokenAmount: 1.0,
        quoteTokenAmount: 167.5,
        lpTokenAmount: 12.94,
        poolAddress: TEST_POOL,
        fee: 0.005,
      };

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`,
        {
          network: NETWORK,
          poolAddress: TEST_POOL,
          baseTokenAmount: 1.0,
          quoteTokenAmount: 167.5,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.lpTokenAmount).toBeGreaterThan(0);
      expect(response.data.baseTokenAmount).toBe(1.0);
      expect(response.data.quoteTokenAmount).toBe(167.5);
    });

    test('handles insufficient balance error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Insufficient balance for SOL',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`,
          {
            network: NETWORK,
            poolAddress: TEST_POOL,
            baseTokenAmount: 10000.0, // Large amount
            quoteTokenAmount: 1675000.0,
            walletAddress: TEST_WALLET,
          },
        ),
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
        signature:
          '3aF7KhhZTPixeNQVxjDv2LcX7VTxQN9vwMv8Z89FwqYKKQRmqPQCuwyWQMjGwUJKdRrPoKNL7Rn6fHZFvVbpT4Zx',
        baseTokenAmount: 0.95,
        quoteTokenAmount: 159.125,
        lpTokenAmount: 12.94,
        poolAddress: TEST_POOL,
        fee: 0.005,
      };

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`,
        {
          network: NETWORK,
          poolAddress: TEST_POOL,
          lpTokenAmount: 12.94,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
      expect(response.data.lpTokenAmount).toBe(12.94);
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
        axios.post(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`,
          {
            network: NETWORK,
            poolAddress: TEST_POOL,
            lpTokenAmount: 10000.0, // Large amount
            walletAddress: TEST_WALLET,
          },
        ),
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

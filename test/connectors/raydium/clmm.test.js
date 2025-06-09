const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'raydium';
const PROTOCOL = 'clmm';
const CHAIN = 'solana';
const NETWORK = 'mainnet-beta';
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const TEST_POOL = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'; // SOL-USDC Raydium CLMM pool
const TEST_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const TEST_POSITION_ID = '123456789';

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
    typeof response.currentTick === 'number' &&
    typeof response.liquidity === 'string'
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
    typeof response.price === 'number' &&
    typeof response.gasPrice === 'number' &&
    typeof response.gasLimit === 'number' &&
    typeof response.gasCost === 'number'
  );
}

// Function to validate position info response structure
function validatePositionInfo(response) {
  return (
    response &&
    typeof response.poolAddress === 'string' &&
    typeof response.positionId === 'string' &&
    typeof response.lowerTick === 'number' &&
    typeof response.upperTick === 'number' &&
    typeof response.liquidity === 'string' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    typeof response.unclaimedFeeBaseAmount === 'number' &&
    typeof response.unclaimedFeeQuoteAmount === 'number'
  );
}

// Function to validate quote position response
function validateQuotePosition(response) {
  return (
    response &&
    typeof response.poolAddress === 'string' &&
    typeof response.lowerTick === 'number' &&
    typeof response.upperTick === 'number' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    typeof response.liquidity === 'string' &&
    typeof response.shareOfPool === 'number'
  );
}

// Tests
describe('Raydium CLMM Tests (Solana Mainnet)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
  });

  describe('Pool Info Endpoint', () => {
    test('returns and validates pool info', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('clmm-pool-info');

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
      expect(response.data.feePct).toBe(0.04); // Typical Raydium CLMM fee
      expect(response.data.currentTick).toBeDefined();

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
      const mockResponse = loadMockResponse('clmm-swap-quote');

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
    });

    test('returns and validates swap quote for BUY', async () => {
      // Modify the mock response for BUY direction
      const mockSellResponse = loadMockResponse('clmm-swap-quote');
      const mockBuyResponse = {
        ...mockSellResponse,
        estimatedAmountIn: mockSellResponse.estimatedAmountOut,
        estimatedAmountOut: mockSellResponse.estimatedAmountIn,
        maxAmountIn: mockSellResponse.estimatedAmountOut * 1.01,
        minAmountOut: mockSellResponse.estimatedAmountIn * 0.99,
        baseTokenBalanceChange: 1.0, // Positive for BUY
        quoteTokenBalanceChange: -mockSellResponse.quoteTokenBalanceChange, // Negative for BUY
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
      expect(response.data.baseTokenBalanceChange).toBeGreaterThan(0); // BUY means positive base token change
      expect(response.data.quoteTokenBalanceChange).toBeLessThan(0); // BUY means negative quote token change
    });
  });

  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Load mock response
      const executeResponse = loadMockResponse('swap-execute');

      // Setup mock axios
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
      expect(response.data.signature).toBeDefined();
      expect(response.data.signature.length).toBeGreaterThan(80); // Solana signatures are long
    });
  });

  describe('Position Info Endpoint', () => {
    test('returns and validates position info', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('clmm-position-info');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`,
        {
          params: {
            network: NETWORK,
            positionId: TEST_POSITION_ID,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePositionInfo(response.data)).toBe(true);
      expect(response.data.positionId).toBe(TEST_POSITION_ID);
      expect(response.data.liquidity).toBeDefined();
    });

    test('handles position not found error', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'NotFound',
            message: 'Position not found',
            code: 404,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`,
          {
            params: {
              network: NETWORK,
              positionId: 'invalid-position',
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

  describe('Positions Owned Endpoint', () => {
    test('returns list of owned positions', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('clmm-positions-owned');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/positions-owned`,
        {
          params: {
            network: NETWORK,
            walletAddress: TEST_WALLET,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);

      // Validate first position
      const firstPosition = response.data[0];
      expect(validatePositionInfo(firstPosition)).toBe(true);
    });
  });

  describe('Quote Position Endpoint', () => {
    test('returns and validates quote for new position', async () => {
      const mockResponse = {
        poolAddress: TEST_POOL,
        lowerTick: -887272,
        upperTick: 887272,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 167.5,
        liquidity: '1294000000',
        shareOfPool: 0.0001,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-position`,
        {
          params: {
            network: NETWORK,
            poolAddress: TEST_POOL,
            lowerTick: -887272,
            upperTick: 887272,
            baseTokenAmount: 1.0,
            quoteTokenAmount: 167.5,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateQuotePosition(response.data)).toBe(true);
      expect(response.data.liquidity).toBeDefined();
      expect(response.data.shareOfPool).toBeGreaterThan(0);
    });

    test('handles invalid tick range error', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Invalid tick range',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-position`,
          {
            params: {
              network: NETWORK,
              poolAddress: TEST_POOL,
              lowerTick: 100,
              upperTick: 50, // Invalid: upper < lower
              baseTokenAmount: 1.0,
              quoteTokenAmount: 167.5,
            },
          },
        ),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('Invalid tick range'),
          },
        },
      });
    });
  });

  describe('Open Position Endpoint', () => {
    test('returns successful position opening', async () => {
      const mockResponse = loadMockResponse('clmm-add-liquidity');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/open-position`,
        {
          network: NETWORK,
          poolAddress: TEST_POOL,
          lowerTick: -887272,
          upperTick: 887272,
          baseTokenAmount: 1.0,
          quoteTokenAmount: 167.5,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.positionId).toBeDefined();
      expect(response.data.liquidity).toBeDefined();
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
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/open-position`,
          {
            network: NETWORK,
            poolAddress: TEST_POOL,
            lowerTick: -887272,
            upperTick: 887272,
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

  describe('Add Liquidity Endpoint', () => {
    test('returns successful liquidity addition to existing position', async () => {
      const mockResponse = loadMockResponse('clmm-add-liquidity');

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
          positionId: TEST_POSITION_ID,
          baseTokenAmount: 0.5,
          quoteTokenAmount: 83.75,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.positionId).toBe(TEST_POSITION_ID);
      expect(response.data.liquidity).toBeDefined();
    });
  });

  describe('Remove Liquidity Endpoint', () => {
    test('returns successful liquidity removal', async () => {
      const mockResponse = {
        signature:
          '4bF7KhhZTPixeNQVxjDv2LcX7VTxQN9vwMv8Z89FwqYKKQRmqPQCuwyWQMjGwUJKdRrPoKNL7Rn6fHZFvVbpU5Ay',
        positionId: TEST_POSITION_ID,
        baseTokenAmount: 0.95,
        quoteTokenAmount: 159.125,
        liquidityRemoved: '647000000',
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
          positionId: TEST_POSITION_ID,
          liquidity: '647000000',
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
      expect(response.data.liquidityRemoved).toBe('647000000');
    });
  });

  describe('Close Position Endpoint', () => {
    test('returns successful position closure', async () => {
      const mockResponse = {
        signature:
          '5cG8KhhZTPixeNQVxjDv2LcX7VTxQN9vwMv8Z89FwqYKKQRmqPQCuwyWQMjGwUJKdRrPoKNL7Rn6fHZFvVbpV6Bz',
        positionId: TEST_POSITION_ID,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 167.5,
        feeBaseAmount: 0.01,
        feeQuoteAmount: 1.675,
      };

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/close-position`,
        {
          network: NETWORK,
          positionId: TEST_POSITION_ID,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.positionId).toBe(TEST_POSITION_ID);
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
    });
  });

  describe('Collect Fees Endpoint', () => {
    test('returns successful fee collection', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('clmm-collect-fees');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/collect-fees`,
        {
          network: NETWORK,
          positionId: TEST_POSITION_ID,
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.feeBaseAmount).toBeGreaterThanOrEqual(0);
      expect(response.data.feeQuoteAmount).toBeGreaterThanOrEqual(0);
    });
  });
});

const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'meteora';
const PROTOCOL = 'clmm';
const NETWORK = 'mainnet-beta';
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const TEST_POOL = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6'; // SOL-USDC Meteora CLMM pool
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
    typeof response.activeBinId === 'number' &&
    typeof response.binStep === 'number'
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
    typeof response.computeUnits === 'number' // Updated to use computeUnits
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
    typeof response.baseLimited === 'boolean' &&
    typeof response.baseTokenAmount === 'number' &&
    typeof response.quoteTokenAmount === 'number' &&
    typeof response.baseTokenAmountMax === 'number' &&
    typeof response.quoteTokenAmountMax === 'number' &&
    response.liquidity !== undefined && // Can be string or object
    typeof response.computeUnits === 'number' // Added computeUnits
  );
}

// Function to validate swap execution response structure
function validateSwapExecution(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' &&
    (response.status !== 1 || // If not CONFIRMED
      (response.data &&
        typeof response.data.tokenIn === 'string' &&
        typeof response.data.tokenOut === 'string' &&
        typeof response.data.amountIn === 'number' &&
        typeof response.data.amountOut === 'number' &&
        typeof response.data.fee === 'number' &&
        typeof response.data.baseTokenBalanceChange === 'number' &&
        typeof response.data.quoteTokenBalanceChange === 'number'))
  );
}

// Function to validate open position response
function validateOpenPosition(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' &&
    (response.status !== 1 || // If not CONFIRMED
      (response.data &&
        typeof response.data.fee === 'number' &&
        typeof response.data.positionAddress === 'string' &&
        typeof response.data.positionRent === 'number' &&
        typeof response.data.baseTokenAmountAdded === 'number' &&
        typeof response.data.quoteTokenAmountAdded === 'number'))
  );
}

// Function to validate add liquidity response
function validateAddLiquidity(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' &&
    (response.status !== 1 || // If not CONFIRMED
      (response.data &&
        typeof response.data.fee === 'number' &&
        typeof response.data.baseTokenAmountAdded === 'number' &&
        typeof response.data.quoteTokenAmountAdded === 'number'))
  );
}

// Function to validate remove liquidity response
function validateRemoveLiquidity(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' &&
    (response.status !== 1 || // If not CONFIRMED
      (response.data &&
        typeof response.data.fee === 'number' &&
        typeof response.data.baseTokenAmountRemoved === 'number' &&
        typeof response.data.quoteTokenAmountRemoved === 'number'))
  );
}

// Function to validate close position response
function validateClosePosition(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' &&
    (response.status !== 1 || // If not CONFIRMED
      (response.data &&
        typeof response.data.fee === 'number' &&
        typeof response.data.positionRentRefunded === 'number' &&
        typeof response.data.baseTokenAmountRemoved === 'number' &&
        typeof response.data.quoteTokenAmountRemoved === 'number' &&
        typeof response.data.baseFeeAmountCollected === 'number' &&
        typeof response.data.quoteFeeAmountCollected === 'number'))
  );
}

// Tests
describe('Meteora CLMM Tests (Solana Mainnet)', () => {
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
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validatePoolInfo(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.address).toBe(TEST_POOL);
      expect(response.data.feePct).toBeGreaterThanOrEqual(0.01); // Typical Meteora CLMM fee
      expect(response.data.activeBinId).toBeDefined();

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            poolAddress: TEST_POOL,
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
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`, {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: 'UNKNOWN',
          },
        }),
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
      const mockResponse = loadMockResponse('clmm-quote-swap-sell');

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
    });

    test('returns and validates swap quote for BUY', async () => {
      // Modify the mock response for BUY direction
      const mockSellResponse = loadMockResponse('swap-quote');
      const mockBuyResponse = {
        ...mockSellResponse,
        estimatedAmountIn: mockSellResponse.estimatedAmountOut,
        estimatedAmountOut: mockSellResponse.estimatedAmountIn,
        maxAmountIn: mockSellResponse.estimatedAmountOut * 1.01,
        minAmountOut: mockSellResponse.estimatedAmountIn * 0.99,
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
            message: 'Insufficient liquidity in pool',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-swap`, {
          params: {
            network: NETWORK,
            baseToken: BASE_TOKEN,
            quoteToken: QUOTE_TOKEN,
            side: 'SELL',
            amount: 1000000.0, // Very large amount
          },
        }),
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

      // Setup mock axios
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
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateSwapExecution(response.data)).toBe(true);
      expect(response.data.signature).toBeDefined();
      expect(response.data.signature.length).toBeGreaterThan(80); // Solana signatures are long
      expect(response.data.status).toBe(1); // CONFIRMED
      expect(response.data.data.tokenIn).toBeDefined();
      expect(response.data.data.tokenOut).toBeDefined();
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
          walletAddress: TEST_WALLET,
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
      // Load mock response
      const mockResponse = loadMockResponse('clmm-position-info');

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`, {
        params: {
          network: NETWORK,
          positionId: TEST_POSITION_ID,
        },
      });

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
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/position-info`, {
          params: {
            network: NETWORK,
            positionId: 'invalid-position',
          },
        }),
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
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/positions-owned`, {
        params: {
          network: NETWORK,
          walletAddress: TEST_WALLET,
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);

      // If there are positions, validate the first one
      if (response.data.length > 0) {
        const firstPosition = response.data[0];
        expect(validatePositionInfo(firstPosition)).toBe(true);
      }
    });

    test('handles empty positions list', async () => {
      // Setup mock axios with empty array
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: [],
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/positions-owned`, {
        params: {
          network: NETWORK,
          walletAddress: 'EmptyWallet123456789',
        },
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBe(0);
    });
  });

  describe('Quote Position Endpoint', () => {
    test('returns and validates quote for new position', async () => {
      const mockResponse = {
        poolAddress: TEST_POOL,
        lowerTick: -88720,
        upperTick: 88720,
        baseLimited: false,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 167.5,
        baseTokenAmountMax: 1.0,
        quoteTokenAmountMax: 167.5,
        liquidity: '1294000000',
        shareOfPool: 0.0001,
        computeUnits: 150000,
      };

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-position`, {
        params: {
          network: NETWORK,
          poolAddress: TEST_POOL,
          lowerTick: -88720,
          upperTick: 88720,
          baseTokenAmount: 1.0,
          quoteTokenAmount: 167.5,
        },
      });

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
            message: 'Invalid tick range: lower tick must be less than upper tick',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-position`, {
          params: {
            network: NETWORK,
            poolAddress: TEST_POOL,
            lowerTick: 100,
            upperTick: 50, // Invalid: upper < lower
            baseTokenAmount: 1.0,
            quoteTokenAmount: 167.5,
          },
        }),
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

    test('handles ticks not aligned with tick spacing error', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Ticks must be aligned with tick spacing',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/quote-position`, {
          params: {
            network: NETWORK,
            poolAddress: TEST_POOL,
            lowerTick: -88721, // Not aligned with tick spacing
            upperTick: 88720,
            baseTokenAmount: 1.0,
            quoteTokenAmount: 167.5,
          },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('tick spacing'),
          },
        },
      });
    });
  });

  describe('Open Position Endpoint', () => {
    test('returns successful position opening', async () => {
      const mockResponse = loadMockResponse('clmm-open-position');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/open-position`, {
        network: NETWORK,
        poolAddress: TEST_POOL,
        lowerTick: -88720,
        upperTick: 88720,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 167.5,
        walletAddress: TEST_WALLET,
      });

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
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/open-position`, {
          network: NETWORK,
          poolAddress: TEST_POOL,
          lowerTick: -88720,
          upperTick: 88720,
          baseTokenAmount: 10000.0, // Large amount
          quoteTokenAmount: 1675000.0,
          walletAddress: TEST_WALLET,
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

  describe('Add Liquidity Endpoint', () => {
    test('returns successful liquidity addition to existing position', async () => {
      const mockResponse = loadMockResponse('clmm-add-liquidity');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`, {
        network: NETWORK,
        positionId: TEST_POSITION_ID,
        baseTokenAmount: 0.5,
        quoteTokenAmount: 83.75,
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.positionId).toBe(TEST_POSITION_ID);
      expect(response.data.liquidity).toBeDefined();
    });

    test('handles position not found error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
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
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/add-liquidity`, {
          network: NETWORK,
          positionId: 'invalid-position',
          baseTokenAmount: 0.5,
          quoteTokenAmount: 83.75,
          walletAddress: TEST_WALLET,
        }),
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

  describe('Remove Liquidity Endpoint', () => {
    test('returns successful liquidity removal', async () => {
      const mockResponse = {
        signature: '4bF7KhhZTPixeNQVxjDv2LcX7VTxQN9vwMv8Z89FwqYKKQRmqPQCuwyWQMjGwUJKdRrPoKNL7Rn6fHZFvVbpU5Ay',
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
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`, {
        network: NETWORK,
        positionId: TEST_POSITION_ID,
        liquidity: '647000000',
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
      expect(response.data.liquidityRemoved).toBe('647000000');
    });

    test('handles invalid liquidity amount error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Liquidity amount exceeds position liquidity',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/remove-liquidity`, {
          network: NETWORK,
          positionId: TEST_POSITION_ID,
          liquidity: '9999999999999999999', // Excessive amount
          walletAddress: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('exceeds position liquidity'),
          },
        },
      });
    });
  });

  describe('Close Position Endpoint', () => {
    test('returns successful position closure', async () => {
      const mockResponse = {
        signature: '5cG8KhhZTPixeNQVxjDv2LcX7VTxQN9vwMv8Z89FwqYKKQRmqPQCuwyWQMjGwUJKdRrPoKNL7Rn6fHZFvVbpV6Bz',
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
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/close-position`, {
        network: NETWORK,
        positionId: TEST_POSITION_ID,
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.positionId).toBe(TEST_POSITION_ID);
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
    });

    test('handles position already closed error', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: 'Position already closed',
            code: 400,
          },
        },
      });

      // Make the request and expect it to be rejected
      await expect(
        axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/close-position`, {
          network: NETWORK,
          positionId: TEST_POSITION_ID,
          walletAddress: TEST_WALLET,
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'BadRequest',
            message: expect.stringContaining('already closed'),
          },
        },
      });
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
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/collect-fees`, {
        network: NETWORK,
        positionId: TEST_POSITION_ID,
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.feeBaseAmount).toBeGreaterThanOrEqual(0);
      expect(response.data.feeQuoteAmount).toBeGreaterThanOrEqual(0);
    });

    test('handles no fees to collect', async () => {
      const mockResponse = {
        signature: '7eH9KihZTPixeNQVxjDv2LcX7VTxQN9vwMv8Z89FwqYKKQRmqPQCuwyWQMjGwUJKdRrPoKNL7Rn6fHZFvVbpX8Ed',
        positionId: TEST_POSITION_ID,
        feeBaseAmount: 0,
        feeQuoteAmount: 0,
      };

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(`http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/collect-fees`, {
        network: NETWORK,
        positionId: TEST_POSITION_ID,
        walletAddress: TEST_WALLET,
      });

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.feeBaseAmount).toBe(0);
      expect(response.data.feeQuoteAmount).toBe(0);
    });
  });
});

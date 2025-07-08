const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'uniswap';
const PROTOCOL = 'clmm';
const NETWORK = 'base'; // Only test Base network
const BASE_TOKEN = 'WETH';
const QUOTE_TOKEN = 'USDC';
const TEST_POOL = '0xd0b53d9277642d899df5c87a3966a349a798f224'; // WETH-USDC on Base
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  // Use mocks from the same directory
  const filePath = path.join(
    __dirname,
    'mocks',
    `${PROTOCOL}-${filename}.json`,
  );
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
    typeof response.quoteTokenAmount === 'number'
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
    typeof response.computeUnits === 'number' // Added computeUnits
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

// Function to validate open position response
function validateOpenPosition(response) {
  return (
    response &&
    typeof response.signature === 'string' &&
    typeof response.status === 'number' &&
    (response.status !== 1 || // If not CONFIRMED
      (response.data &&
        typeof response.data.fee === 'number' &&
        typeof response.data.positionId === 'string' &&
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
        typeof response.data.baseTokenAmountRemoved === 'number' &&
        typeof response.data.quoteTokenAmountRemoved === 'number' &&
        typeof response.data.baseFeeAmountCollected === 'number' &&
        typeof response.data.quoteFeeAmountCollected === 'number'))
  );
}

// Tests
describe('Uniswap CLMM Tests (Base Network)', () => {
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
      expect(response.data.feePct).toBe(0.05); // 0.05% fee for CLMM

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
        axios.get(
          `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/pool-info`,
          {
            params: {
              network: NETWORK,
              baseToken: 'UNKNOWN',
              quoteToken: QUOTE_TOKEN,
            },
          },
        ),
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
      const mockSellResponse = loadMockResponse('quote-swap');
      const mockBuyResponse = {
        ...mockSellResponse,
        // Flip the values for BUY direction
        estimatedAmountIn: mockSellResponse.estimatedAmountOut,
        estimatedAmountOut: mockSellResponse.estimatedAmountIn,
        baseTokenBalanceChange: 1.0, // Positive for BUY
        quoteTokenBalanceChange: -mockSellResponse.quoteTokenBalanceChange, // Negative for BUY
        // For BUY: price = quote needed / base received
        price:
          mockSellResponse.estimatedAmountOut /
          mockSellResponse.estimatedAmountIn,
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
  });

  describe('Execute Swap Endpoint', () => {
    test('returns successful swap execution', async () => {
      // Mock a quote-swap response to use as input for execute-swap
      const quoteResponse = loadMockResponse('quote-swap');

      // Mock a successful execution response
      const executeResponse = {
        signature:
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
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
      const response = await axios.post(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`,
        {
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0,
          wallet: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.amountIn).toBe(quoteResponse.estimatedAmountIn);
      expect(response.data.amountOut).toBe(quoteResponse.estimatedAmountOut);
    });
  });

  describe('Position Info Endpoint', () => {
    test('returns and validates position info', async () => {
      const mockResponse = {
        poolAddress: TEST_POOL,
        positionId: '123456',
        lowerTick: -887272,
        upperTick: 887272,
        liquidity: '1000000000000000000',
        baseTokenAmount: 1.5,
        quoteTokenAmount: 3510.75,
        unclaimedFeeBaseAmount: 0.001,
        unclaimedFeeQuoteAmount: 2.34,
      };

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
            positionId: '123456',
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.positionId).toBe('123456');
      expect(response.data.liquidity).toBeDefined();
      expect(response.data.unclaimedFeeBaseAmount).toBeGreaterThanOrEqual(0);
      expect(response.data.unclaimedFeeQuoteAmount).toBeGreaterThanOrEqual(0);
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
      const mockResponse = [
        {
          poolAddress: TEST_POOL,
          positionId: '123456',
          lowerTick: -887272,
          upperTick: 887272,
          liquidity: '1000000000000000000',
          baseTokenAmount: 1.5,
          quoteTokenAmount: 3510.75,
          unclaimedFeeBaseAmount: 0.001,
          unclaimedFeeQuoteAmount: 2.34,
        },
        {
          poolAddress: TEST_POOL,
          positionId: '789012',
          lowerTick: -443636,
          upperTick: 443636,
          liquidity: '500000000000000000',
          baseTokenAmount: 0.75,
          quoteTokenAmount: 1755.375,
          unclaimedFeeBaseAmount: 0.0005,
          unclaimedFeeQuoteAmount: 1.17,
        },
      ];

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
            wallet: TEST_WALLET,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBe(2);
      expect(response.data[0].positionId).toBe('123456');
      expect(response.data[1].positionId).toBe('789012');
    });
  });

  describe('Quote Position Endpoint', () => {
    test('returns and validates quote for new position', async () => {
      const mockResponse = {
        poolAddress: TEST_POOL,
        lowerTick: -887272,
        upperTick: 887272,
        baseTokenAmount: 1.0,
        quoteTokenAmount: 2340.5,
        liquidity: '680000000000000000',
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
            quoteTokenAmount: 2340.5,
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
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
              quoteTokenAmount: 2340.5,
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
      const mockResponse = {
        signature:
          '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        positionId: '345678',
        poolAddress: TEST_POOL,
        lowerTick: -887272,
        upperTick: 887272,
        liquidity: '680000000000000000',
        baseTokenAmount: 1.0,
        quoteTokenAmount: 2340.5,
        fee: 0.003,
      };

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
          quoteTokenAmount: 2340.5,
          wallet: TEST_WALLET,
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
            message: 'Insufficient balance for WETH',
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
            quoteTokenAmount: 23405000.0,
            wallet: TEST_WALLET,
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
      const mockResponse = {
        signature:
          '0xdef4567890abcdef1234567890abcdef1234567890abcdef1234567890abcd12',
        positionId: '123456',
        liquidity: '340000000000000000',
        baseTokenAmount: 0.5,
        quoteTokenAmount: 1170.25,
        fee: 0.003,
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
          positionId: '123456',
          baseTokenAmount: 0.5,
          quoteTokenAmount: 1170.25,
          wallet: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.positionId).toBe('123456');
      expect(response.data.liquidity).toBeDefined();
    });
  });

  describe('Remove Liquidity Endpoint', () => {
    test('returns successful liquidity removal', async () => {
      const mockResponse = {
        signature:
          '0x1234abcd5678efgh1234abcd5678efgh1234abcd5678efgh1234abcd5678efgh',
        positionId: '123456',
        baseTokenAmount: 0.75,
        quoteTokenAmount: 1755.375,
        liquidityRemoved: '500000000000000000',
        fee: 0.003,
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
          positionId: '123456',
          liquidity: '500000000000000000',
          wallet: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
      expect(response.data.liquidityRemoved).toBe('500000000000000000');
    });
  });

  describe('Close Position Endpoint', () => {
    test('returns successful position closure', async () => {
      const mockResponse = {
        signature:
          '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
        positionId: '123456',
        baseTokenAmount: 1.5,
        quoteTokenAmount: 3510.75,
        feeBaseAmount: 0.001,
        feeQuoteAmount: 2.34,
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
          positionId: '123456',
          wallet: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data.signature).toBeDefined();
      expect(response.data.positionId).toBe('123456');
      expect(response.data.baseTokenAmount).toBeGreaterThan(0);
      expect(response.data.quoteTokenAmount).toBeGreaterThan(0);
    });
  });

  describe('Collect Fees Endpoint', () => {
    test('returns successful fee collection', async () => {
      const mockResponse = {
        signature:
          '0x9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff',
        positionId: '123456',
        feeBaseAmount: 0.001,
        feeQuoteAmount: 2.34,
      };

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
          positionId: '123456',
          wallet: TEST_WALLET,
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

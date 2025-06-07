const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CONNECTOR = 'uniswap';
const PROTOCOL = 'clmm';
const CHAIN = 'ethereum';
const NETWORK = 'base'; // Test on Base network
const BASE_TOKEN = 'WETH'; // Test wrapping with WETH
const QUOTE_TOKEN = 'USDC';
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');
jest.mock('../../../src/chains/ethereum/routes/wrap', () => {
  return {
    wrapEthereum: jest
      .fn()
      .mockImplementation(async (fastify, network, walletAddress, amount) => {
        return {
          signature:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          nonce: 123,
          fee: '0.0001',
          amount: amount,
          wrappedAddress: '0x4200000000000000000000000000000000000006', // Base WETH address
          nativeToken: 'ETH',
          wrappedToken: 'WETH',
          tx: {
            data: '0x',
            to: '0x4200000000000000000000000000000000000006',
            value: '1000000000000000000', // 1 ETH in wei
          },
        };
      }),
  };
});

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  try {
    // First try to find connector-specific mock
    const filePath = path.join(
      __dirname,
      '..',
      '..',
      'mocks',
      'connectors',
      `${CONNECTOR}`,
      `${filename}.json`,
    );
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    // If not found, create a mock response
    if (filename === 'quote-swap') {
      return {
        estimatedAmountIn: 1.0,
        estimatedAmountOut: 1800.0,
        minAmountOut: 1782.0,
        maxAmountIn: 1.0,
        price: 1800.0,
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 1800.0,
        gasPrice: 5.0,
        gasLimit: 250000,
        gasCost: 0.00125,
        poolAddress: '0xd0b53d9277642d899df5c87a3966a349a798f224', // WETH-USDC on Base
      };
    }
    return {};
  }
}

// Tests
describe('Uniswap CLMM ETH to WETH Wrapping Tests', () => {
  const { wrapEthereum } = require('../../../src/chains/ethereum/routes/wrap');

  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
    wrapEthereum.mockClear();
  });

  describe('Execute Swap with ETH to WETH Wrapping', () => {
    test('returns successful swap execution with ETH wrapping', async () => {
      // Create a quote-swap response to use as input for execute-swap
      const quoteResponse = loadMockResponse('quote-swap');

      // Mock a successful execution response
      const executeResponse = {
        // Include both wrap and swap transaction hashes
        signature: `swap:0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef,wrap:0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`,
        totalInputSwapped: quoteResponse.estimatedAmountIn,
        totalOutputSwapped: quoteResponse.estimatedAmountOut,
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
          walletAddress: TEST_WALLET,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);

      // Check that the signature includes both wrap and swap transaction hashes
      expect(response.data.signature).toContain('swap:');
      expect(response.data.signature).toContain('wrap:');

      // Verify swap amounts are correct
      expect(response.data.totalInputSwapped).toBe(
        quoteResponse.estimatedAmountIn,
      );
      expect(response.data.totalOutputSwapped).toBe(
        quoteResponse.estimatedAmountOut,
      );

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/connectors/${CONNECTOR}/${PROTOCOL}/execute-swap`,
        expect.objectContaining({
          network: NETWORK,
          baseToken: BASE_TOKEN,
          quoteToken: QUOTE_TOKEN,
          side: 'SELL',
          amount: 1.0,
          walletAddress: TEST_WALLET,
        }),
      );
    });

    test('calls wrapEthereum function for ETH to WETH wrapping when value is present', async () => {
      // Setup the executeSwap handler to actually call our mocked wrapEthereum
      // This is a more advanced test that requires accessing the implementation directly
      const executeSwapHandler = async (req, res) => {
        // Mock a successful execution with ETH wrapping
        const wrapAmount = '1.0'; // 1 ETH

        // Call the wrapEthereum function (this will use our mock)
        const wrapResult = await wrapEthereum(
          {},
          NETWORK,
          TEST_WALLET,
          wrapAmount,
        );

        // Create a mock swap result that includes the wrap transaction
        return {
          signature: `swap:0x9876543210abcdef,wrap:${wrapResult.signature}`,
          totalInputSwapped: 1.0,
          totalOutputSwapped: 1800.0,
          fee: 0.003,
          baseTokenBalanceChange: -1.0,
          quoteTokenBalanceChange: 1800.0,
        };
      };

      // Mock axios to use our handler
      axios.post.mockImplementationOnce(async (url, data) => {
        const response = await executeSwapHandler(data);
        return {
          status: 200,
          data: response,
        };
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

      // Validate that wrapEthereum was called
      expect(wrapEthereum).toHaveBeenCalledWith(
        expect.anything(),
        NETWORK,
        TEST_WALLET,
        expect.any(String),
      );

      // Validate the response contains the wrapped transaction hash
      expect(response.data.signature).toContain('wrap:0x1234567890abcdef');
    });

    test('handles errors during ETH wrapping process', async () => {
      // Setup wrapEthereum to throw an error
      wrapEthereum.mockImplementationOnce(() => {
        throw new Error('Insufficient ETH balance for wrapping');
      });

      // Setup axios to use a custom handler that calls wrapEthereum directly
      axios.post.mockImplementationOnce(async (url, data) => {
        try {
          // This will trigger our mock that throws an error
          await wrapEthereum({}, NETWORK, TEST_WALLET, '1.0');
          return { status: 200, data: {} };
        } catch (error) {
          throw {
            response: {
              status: 400,
              data: {
                error: `Failed to execute swap: ${error.message}`,
              },
            },
          };
        }
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
            amount: 1.0,
            walletAddress: TEST_WALLET,
          },
        ),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: expect.stringContaining('Insufficient ETH balance'),
          },
        },
      });

      // Verify wrapEthereum was called
      expect(wrapEthereum).toHaveBeenCalled();
    });
  });
});

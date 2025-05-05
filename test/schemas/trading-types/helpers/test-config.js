/**
 * Configuration constants for trading-type tests
 */

// Test timeout settings
const TEST_TIMEOUT = 30000; // 30 seconds

// API endpoint configuration
const API_CONFIG = {
  baseUrl: 'http://localhost:15888',
  endpoints: {
    uniswap: {
      amm: {
        poolInfo: '/connectors/uniswap/amm/pool-info',
        quoteSwap: '/connectors/uniswap/amm/quote-swap',
        executeSwap: '/connectors/uniswap/amm/execute-swap',
        positions: '/connectors/uniswap/amm/position-info'
      },
      clmm: {
        poolInfo: '/connectors/uniswap/clmm/pool-info',
        quoteSwap: '/connectors/uniswap/clmm/quote-swap',
        executeSwap: '/connectors/uniswap/clmm/execute-swap',
        positions: '/connectors/uniswap/clmm/position-info'
      }
    },
    meteora: {
      clmm: {
        poolInfo: '/connectors/meteora/clmm/pool-info',
        quoteSwap: '/connectors/meteora/clmm/quote-swap',
        executeSwap: '/connectors/meteora/clmm/execute-swap',
        positions: '/connectors/meteora/clmm/position-info'
      }
    },
    jupiter: {
      quoteSwap: '/connectors/jupiter/quote-swap',
      executeSwap: '/connectors/jupiter/execute-swap'
    },
    raydium: {
      amm: {
        poolInfo: '/connectors/raydium/amm/pool-info',
        quoteSwap: '/connectors/raydium/amm/quote-swap'
      },
      clmm: {
        poolInfo: '/connectors/raydium/clmm/pool-info',
        quoteSwap: '/connectors/raydium/clmm/quote-swap'
      }
    }
  }
};

// Test mode configuration
const TEST_MODES = {
  MOCK: 'mock',
  LIVE: 'live'
};

/**
 * Helper function to determine if we should skip live tests
 * @returns {boolean} True if live tests should be skipped
 */
const shouldSkipLiveTests = () => {
  return process.env.GATEWAY_TEST_MODE !== TEST_MODES.LIVE;
};

/**
 * Helper to configure jest timeout
 */
const configureTestTimeout = () => {
  jest.setTimeout(TEST_TIMEOUT);
};

/**
 * Creates a mock API response for when actual API calls are not made
 * @param {string} type - Type of response to mock ('success' or 'error')
 * @param {object} data - Data to include in the mock response
 * @returns {object} Mock response object
 */
const createMockResponse = (type, data) => {
  if (type === 'success') {
    return {
      data: data
    };
  } else {
    return {
      response: {
        status: 400,
        data: {
          error: 'Mock error',
          details: data || 'Mock error details'
        }
      }
    };
  }
};

module.exports = {
  TEST_TIMEOUT,
  API_CONFIG,
  TEST_MODES,
  shouldSkipLiveTests,
  configureTestTimeout,
  createMockResponse
};
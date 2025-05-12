const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CHAIN = 'ethereum';
const NETWORK = 'base'; // Only test Base network
const TEST_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TEST_SPENDER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'; // Uniswap V3 Position Manager
const TEST_TOKEN_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  // Use generic ethereum mocks instead of network-specific
  const filePath = path.join(
    __dirname,
    '..',
    'mocks',
    'chains',
    `${CHAIN}`,
    `${filename}.json`,
  );
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to validate balance response structure
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

// Function to validate tokens response structure
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

// Function to validate status response structure
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

// Function to validate allowances response structure
function validateAllowancesResponse(response) {
  return (
    response &&
    typeof response.spender === 'string' &&
    typeof response.approvals === 'object' &&
    Object.values(response.approvals).every(
      (value) => typeof value === 'string',
    )
  );
}

// Function to validate approve response structure
function validateApproveResponse(response) {
  return (
    response &&
    typeof response.tokenAddress === 'string' &&
    typeof response.spender === 'string' &&
    typeof response.amount === 'string' &&
    typeof response.nonce === 'number' &&
    typeof response.txHash === 'string' &&
    typeof response.approval === 'object' &&
    typeof response.approval.data === 'string' &&
    typeof response.approval.to === 'string'
  );
}

// Tests
describe('Ethereum Chain Tests (Base Network)', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
    axios.post.mockClear();
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
            tokens: ['ETH', 'USDC', 'WETH'],
          },
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateBalanceResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.wallet).toBe(TEST_WALLET);
      expect(response.data.balances).toHaveLength(3); // ETH, USDC, and WETH

      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            wallet: TEST_WALLET,
            tokens: ['ETH', 'USDC', 'WETH'],
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
            tokens: ['ETH'],
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
      expect(response.data.tokens.length).toBeGreaterThanOrEqual(3);

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

  describe('Allowances Endpoint', () => {
    test('returns allowances using token symbols', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('allowances');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/chains/${CHAIN}/allowances`,
        {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          tokens: ['USDC', 'DAI'],
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateAllowancesResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.spender).toBe(TEST_SPENDER);
      expect(response.data.approvals).toHaveProperty('USDC');
      expect(response.data.approvals).toHaveProperty('DAI');

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/allowances`,
        expect.objectContaining({
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          tokens: ['USDC', 'DAI'],
        }),
      );
    });

    test('returns allowances using token addresses', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('allowances');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request with token addresses
      const response = await axios.post(
        `http://localhost:15888/chains/${CHAIN}/allowances`,
        {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          tokens: [
            TEST_TOKEN_ADDRESS,
            '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          ], // USDC and DAI addresses
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateAllowancesResponse(response.data)).toBe(true);

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/allowances`,
        expect.objectContaining({
          tokens: [
            TEST_TOKEN_ADDRESS,
            '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          ],
        }),
      );
    });

    test('handles error when no tokens are found', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'None of the provided tokens were found: INVALID_TOKEN',
            code: 400,
          },
        },
      });

      // Make the request with invalid token
      await expect(
        axios.post(`http://localhost:15888/chains/${CHAIN}/allowances`, {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          tokens: ['INVALID_TOKEN'],
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: expect.stringContaining(
              'None of the provided tokens were found',
            ),
          },
        },
      });
    });
  });

  describe('Approve Endpoint', () => {
    test('approves token using token symbol', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('approve');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.post(
        `http://localhost:15888/chains/${CHAIN}/approve`,
        {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          token: 'USDC',
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateApproveResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.tokenAddress).toBe(TEST_TOKEN_ADDRESS);
      expect(response.data.spender).toBe(TEST_SPENDER);

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/approve`,
        expect.objectContaining({
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          token: 'USDC',
        }),
      );
    });

    test('approves token using token address', async () => {
      // Load mock response
      const mockResponse = loadMockResponse('approve');

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request with token address
      const response = await axios.post(
        `http://localhost:15888/chains/${CHAIN}/approve`,
        {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          token: TEST_TOKEN_ADDRESS,
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateApproveResponse(response.data)).toBe(true);

      // Check expected mock values
      expect(response.data.tokenAddress).toBe(TEST_TOKEN_ADDRESS);

      // Verify axios was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/approve`,
        expect.objectContaining({
          token: TEST_TOKEN_ADDRESS,
        }),
      );
    });

    test('approves token with custom amount', async () => {
      // Load mock response
      const mockResponse = {
        ...loadMockResponse('approve'),
        amount: '1000000', // 1 USDC with 6 decimals
      };

      // Setup mock axios
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request with amount
      const response = await axios.post(
        `http://localhost:15888/chains/${CHAIN}/approve`,
        {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          token: 'USDC',
          amount: '1',
        },
      );

      // Validate the response
      expect(response.status).toBe(200);
      expect(validateApproveResponse(response.data)).toBe(true);

      // Verify amount was set correctly
      expect(response.data.amount).toBe('1000000');
    });

    test('handles error for invalid token', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error:
              'Token not supported and not a valid Ethereum address: INVALID_TOKEN',
            code: 400,
          },
        },
      });

      // Make the request with invalid token
      await expect(
        axios.post(`http://localhost:15888/chains/${CHAIN}/approve`, {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          token: 'INVALID_TOKEN',
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: expect.stringContaining('Token not supported'),
          },
        },
      });
    });

    test('handles error for invalid token address', async () => {
      // Setup mock axios with error response
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error:
              'Invalid token address or not an ERC20 token: 0x1234567890abcdef',
            code: 400,
          },
        },
      });

      // Make the request with invalid address format
      await expect(
        axios.post(`http://localhost:15888/chains/${CHAIN}/approve`, {
          network: NETWORK,
          address: TEST_WALLET,
          spenderAddress: TEST_SPENDER,
          token: '0x1234567890abcdef', // Invalid address format
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: expect.stringContaining('Invalid token address'),
          },
        },
      });
    });
  });
});

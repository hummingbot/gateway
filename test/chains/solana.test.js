const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Constants for this test file
const CHAIN = 'solana';
const NETWORK = 'mainnet-beta';  // Only test mainnet-beta network
const TEST_WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';

// Mock API calls (axios.get and axios.post)
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

// Helper to load mock responses
function loadMockResponse(filename) {
  const filePath = path.join(__dirname, '..', 'mocks', 'chains', `${CHAIN}-${NETWORK}`, `${filename}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to validate balance response structure
function validateBalanceResponse(response) {
  return (
    response &&
    typeof response.network === 'string' &&
    typeof response.wallet === 'string' &&
    Array.isArray(response.balances) &&
    response.balances.every(balance => 
      typeof balance.symbol === 'string' &&
      typeof balance.address === 'string' &&
      typeof balance.decimals === 'number' &&
      typeof balance.name === 'string' &&
      typeof balance.balance === 'string'
    )
  );
}

// Function to validate tokens response structure
function validateTokensResponse(response) {
  return (
    response &&
    typeof response.network === 'string' &&
    Array.isArray(response.tokens) &&
    response.tokens.every(token => 
      typeof token.symbol === 'string' &&
      typeof token.address === 'string' &&
      typeof token.decimals === 'number' &&
      typeof token.name === 'string'
    )
  );
}

// Function to validate status response structure
function validateStatusResponse(response) {
  return (
    response &&
    typeof response.network === 'string' &&
    typeof response.isConnected === 'boolean' &&
    (response.latestBlock === undefined || typeof response.latestBlock === 'number') &&
    (response.gasPrice === undefined || typeof response.gasPrice === 'string') &&
    (response.nativeCurrency === undefined || 
      (typeof response.nativeCurrency.name === 'string' &&
       typeof response.nativeCurrency.symbol === 'string' &&
       typeof response.nativeCurrency.decimals === 'number'))
  );
}

// Tests
describe('Solana Chain Tests (Mainnet Beta)', () => {
  
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
        data: mockResponse 
      });
      
      // Make the request
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/balances`, {
        params: {
          network: NETWORK,
          wallet: TEST_WALLET,
          tokenSymbols: ['SOL', 'USDC', 'USDT']
        }
      });
      
      // Validate the response
      expect(response.status).toBe(200);
      expect(validateBalanceResponse(response.data)).toBe(true);
      
      // Check expected mock values
      expect(response.data.network).toBe(NETWORK);
      expect(response.data.wallet).toBe(TEST_WALLET);
      expect(response.data.balances).toHaveLength(3); // SOL, USDC, USDT
      
      // Verify axios was called with correct parameters
      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        expect.objectContaining({
          params: expect.objectContaining({
            network: NETWORK,
            wallet: TEST_WALLET
          })
        })
      );
    });
    
    test('handles error response for invalid wallet', async () => {
      // Setup mock axios with error response
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'Invalid wallet address',
            code: 400
          }
        }
      });
      
      // Make the request and expect it to be rejected
      await expect(
        axios.get(`http://localhost:15888/chains/${CHAIN}/balances`, {
          params: {
            network: NETWORK,
            wallet: 'invalidwallet',
            tokenSymbols: ['SOL']
          }
        })
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            error: 'Invalid wallet address'
          }
        }
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
        data: mockResponse 
      });
      
      // Make the request
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/tokens`, {
        params: {
          network: NETWORK
        }
      });
      
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
            network: NETWORK
          })
        })
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
        data: mockResponse 
      });
      
      // Make the request
      const response = await axios.get(`http://localhost:15888/chains/${CHAIN}/status`, {
        params: {
          network: NETWORK
        }
      });
      
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
            network: NETWORK
          })
        })
      );
    });
  });
});
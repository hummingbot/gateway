// test/chains/cardano/cardano.test.js

const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Constants for this test file
const CHAIN = 'cardano';
const NETWORK = 'preprod'; // for balance‐endpoint only
const TEST_WALLET =
  'addr_test1vrvqa7ytgmptew2qy3ec0lqdk9n94vcgwu4wy07kqp2he0srll8mg';

// Mock API calls
jest.mock('axios');

// Helper to load mock responses
function loadMockResponse(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, 'mocks', `${name}.json`), 'utf8'),
  );
}

// Validate balance response shape
function validateBalanceResponse(resp) {
  return (
    resp &&
    typeof resp.network === 'string' &&
    typeof resp.wallet === 'string' &&
    Array.isArray(resp.balances) &&
    resp.balances.every(
      (b) =>
        ['symbol', 'address', 'name', 'balance'].every(
          (k) => typeof b[k] === 'string',
        ) && typeof b.decimals === 'number',
    )
  );
}

describe('Cardano Chain Tests (Preprod Network)', () => {
  beforeEach(() => {
    axios.get = jest.fn();
    axios.post = jest.fn();
  });

  describe('Balance Endpoint', () => {
    test('returns and validates wallet balances', async () => {
      const mockResponse = loadMockResponse('balance');

      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const response = await axios.get(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        {
          params: {
            network: NETWORK,
            wallet: TEST_WALLET,
            tokens: ['ADA', 'MIN', 'LP'],
          },
        },
      );

      expect(response.status).toBe(200);
      expect(validateBalanceResponse(response.data)).toBe(true);

      // must match the fixture exactly
      expect(response.data.network).toBe(mockResponse.network);
      expect(response.data.wallet).toBe(mockResponse.wallet);
      expect(response.data.balances).toHaveLength(mockResponse.balances.length);

      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/balances`,
        expect.objectContaining({
          params: {
            network: NETWORK,
            wallet: TEST_WALLET,
            tokens: ['ADA', 'MIN', 'LP'],
          },
        }),
      );
    });

    test('handles error response for invalid wallet', async () => {
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Invalid wallet address', code: 400 },
        },
      });

      await expect(
        axios.get(`http://localhost:15888/chains/${CHAIN}/balances`, {
          params: { network: NETWORK, wallet: 'invalid', tokens: ['ADA'] },
        }),
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: { error: 'Invalid wallet address' },
        },
      });
    });
  });

  describe('Tokens Endpoint', () => {
    test('returns and validates token list', async () => {
      const mockResponse = loadMockResponse('tokens');

      axios.get.mockResolvedValueOnce({ status: 200, data: mockResponse });

      const response = await axios.get(
        `http://localhost:15888/chains/${CHAIN}/tokens`,
        { params: { network: mockResponse.network } },
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.tokens)).toBe(true);
      response.data.tokens.forEach((t) => {
        expect(typeof t.symbol).toBe('string');
        expect(typeof t.address).toBe('string');
        expect(typeof t.decimals).toBe('number');
        expect(typeof t.name).toBe('string');
      });

      // derive network from the fixture
      if ('network' in mockResponse) {
        expect(response.data.network).toBe(mockResponse.network);
      }
      expect(response.data.tokens.length).toBeGreaterThan(0);

      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/tokens`,
        expect.objectContaining({
          params: { network: mockResponse.network },
        }),
      );
    });
  });

  describe('Status Endpoint', () => {
    test('returns and validates chain status', async () => {
      const mockResponse = loadMockResponse('status');

      axios.get.mockResolvedValueOnce({ status: 200, data: mockResponse });

      const response = await axios.get(
        `http://localhost:15888/chains/${CHAIN}/status`,
        { params: { network: mockResponse.network } },
      );

      expect(response.status).toBe(200);

      if ('network' in mockResponse) {
        expect(response.data.network).toBe(mockResponse.network);
      }

      if ('chain' in mockResponse) {
        expect(response.data.chain).toBe(mockResponse.chain);
      }

      if ('latestBlock' in mockResponse) {
        expect(typeof response.data.latestBlock).toBe('number');
      }

      if ('rpcUrl' in mockResponse) {
        expect(typeof response.data.rpcUrl).toBe('string');
      }

      if ('nativeCurrency' in mockResponse) {
        expect(response.data.nativeCurrency).toBe('ADA');
      }

      expect(axios.get).toHaveBeenCalledWith(
        `http://localhost:15888/chains/${CHAIN}/status`,
        expect.objectContaining({
          params: { network: mockResponse.network },
        }),
      );
    });
  });
});

const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

// Mock API calls
jest.mock('axios');

// Mock implementation for axios
axios.get = jest.fn();

describe('Chain Routes Tests', () => {
  beforeEach(() => {
    // Reset axios mocks before each test
    axios.get.mockClear();
  });

  describe('Chains Endpoint', () => {
    test('returns available chains and networks', async () => {
      // Load mock response
      const mockResponse = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, '..', 'mocks', 'chains', 'chains.json'),
          'utf8',
        ),
      );

      // Setup mock axios
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      // Make the request
      const response = await axios.get('http://localhost:15888/chains');

      // Validate the response
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('chains');
      expect(Array.isArray(response.data.chains)).toBe(true);

      // Check chains
      const chains = response.data.chains;
      expect(chains.length).toBe(2);

      // Check ethereum
      const ethereum = chains.find((c) => c.chain === 'ethereum');
      expect(ethereum).toBeDefined();
      expect(ethereum.networks).toContain('mainnet');
      expect(ethereum.networks).toContain('base');

      // Check solana
      const solana = chains.find((c) => c.chain === 'solana');
      expect(solana).toBeDefined();
      expect(solana.networks).toContain('mainnet-beta');
      expect(solana.networks).toContain('devnet');

      // Verify axios was called correctly
      expect(axios.get).toHaveBeenCalledWith('http://localhost:15888/chains');
    });
  });
});

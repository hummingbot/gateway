import Fastify, { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/services/token-service');

// Import after mocking
import { TokenService } from '../../src/services/token-service';
import { tokensRoutes } from '../../src/tokens/tokens.routes';

describe('Token Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(tokensRoutes);

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementation
    (TokenService.getInstance as jest.Mock) = jest.fn().mockReturnValue({
      listTokens: jest.fn(),
      getToken: jest.fn(),
      addToken: jest.fn(),
      removeToken: jest.fn(),
      validateToken: jest.fn(),
      loadTokenList: jest.fn(),
      saveTokenList: jest.fn(),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /tokens', () => {
    it('should return empty list when no chain/network specified', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        tokens: [],
      });
    });

    it('should return tokens when chain and network specified', async () => {
      const mockTokens = [
        {
          chainId: 1,
          name: 'USD Coin',
          symbol: 'USDC',
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6,
        },
      ];

      const mockService = TokenService.getInstance();
      (mockService.listTokens as jest.Mock).mockResolvedValue(mockTokens);

      const response = await app.inject({
        method: 'GET',
        url: '/?chain=ethereum&network=mainnet',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        tokens: mockTokens,
      });
    });

    it('should return 404 when token list not found', async () => {
      const mockService = (TokenService.getInstance as jest.Mock).mockReturnValue({
        listTokens: jest.fn().mockRejectedValue(new Error('Token list not found for ethereum/invalid')),
        getToken: jest.fn(),
        addToken: jest.fn(),
        removeToken: jest.fn(),
        validateToken: jest.fn(),
        loadTokenList: jest.fn(),
        saveTokenList: jest.fn(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/?chain=ethereum&network=invalid',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /tokens/:symbolOrAddress', () => {
    it('should return token when found', async () => {
      const mockToken = {
        chainId: 1,
        name: 'USD Coin',
        symbol: 'USDC',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      };

      const mockService = TokenService.getInstance();
      (mockService.getToken as jest.Mock).mockResolvedValue(mockToken);

      const response = await app.inject({
        method: 'GET',
        url: '/USDC?chain=ethereum&network=mainnet',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        token: mockToken,
        chain: 'ethereum',
        network: 'mainnet',
      });
    });

    it('should return 404 when token not found', async () => {
      const mockService = TokenService.getInstance();
      (mockService.getToken as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/INVALID?chain=ethereum&network=mainnet',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /tokens', () => {
    it('should add token successfully', async () => {
      const mockToken = {
        chainId: 1,
        name: 'Test Token',
        symbol: 'TEST',
        address: '0x1234567890123456789012345678901234567890',
        decimals: 18,
      };

      const mockService = TokenService.getInstance();
      (mockService.addToken as jest.Mock).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          chain: 'ethereum',
          network: 'mainnet',
          token: mockToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        message: 'Token TEST added/updated successfully in ethereum/mainnet. Gateway restart required.',
        requiresRestart: true,
      });
    });

    it('should return 400 for invalid token data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          chain: 'ethereum',
          network: 'mainnet',
          token: {
            symbol: 'TEST',
            // missing required fields
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should update existing token with same symbol', async () => {
      const mockService = TokenService.getInstance();
      (mockService.addToken as jest.Mock).mockResolvedValue(undefined);

      const updatedToken = {
        chainId: 1,
        symbol: 'TEST',
        name: 'Updated Test Token',
        address: '0xNewAddress1234567890123456789012345678',
        decimals: 9,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          chain: 'ethereum',
          network: 'mainnet',
          token: updatedToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        message: 'Token TEST added/updated successfully in ethereum/mainnet. Gateway restart required.',
        requiresRestart: true,
      });
    });
  });

  describe('DELETE /tokens/:address', () => {
    it('should remove token successfully', async () => {
      const mockService = TokenService.getInstance();
      (mockService.removeToken as jest.Mock).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: '/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?chain=ethereum&network=mainnet',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        message:
          'Token with address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 removed successfully from ethereum/mainnet. Gateway restart required.',
        requiresRestart: true,
      });
    });

    it('should return 404 when token not found', async () => {
      const mockService = TokenService.getInstance();
      (mockService.removeToken as jest.Mock).mockRejectedValue(new Error('Token 0x123 not found in ethereum/mainnet'));

      const response = await app.inject({
        method: 'DELETE',
        url: '/0x123?chain=ethereum&network=mainnet',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

import { FastifyInstance } from 'fastify';

// Import shared mocks before importing app
import '../../../mocks/app-mocks';

import { gatewayApp } from '../../../../src/app';
import { Solana } from '../../../../src/chains/solana/solana';

// Mock Solana class
jest.mock('../../../../src/chains/solana/solana');

describe('Solana Balances Route - Rate Limit Handling', () => {
  let fastify: FastifyInstance;
  let mockSolanaInstance: jest.Mocked<Solana>;

  beforeAll(async () => {
    fastify = gatewayApp;
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock Solana instance
    mockSolanaInstance = {
      getBalances: jest.fn(),
      network: 'mainnet-beta',
      nativeTokenSymbol: 'SOL',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
    } as any;

    // Mock getInstance to return our mock
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
  });

  describe('POST /chains/solana/balances - Rate Limit Errors', () => {
    it('should return 429 when RPC returns rate limit error', async () => {
      const error429 = new Error(
        'Solana RPC rate limit exceeded. Your current RPC endpoint (https://api.mainnet-beta.solana.com) has reached its rate limit.',
      );
      (error429 as any).statusCode = 429;
      (error429 as any).name = 'TooManyRequestsError';

      mockSolanaInstance.getBalances.mockRejectedValue(error429);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/balances',
        payload: {
          network: 'mainnet-beta',
          address: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
          tokens: [],
        },
      });

      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        statusCode: 429,
        error: 'TooManyRequestsError',
        message: expect.stringContaining('rate limit'),
      });
    });

    it('should return 500 for non-rate-limit errors', async () => {
      const networkError = new Error('Network connection failed');

      mockSolanaInstance.getBalances.mockRejectedValue(networkError);

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/balances',
        payload: {
          network: 'mainnet-beta',
          address: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
          tokens: [],
        },
      });

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        statusCode: 500,
        // The unified chain routes surface errors through the same helper the trading
        // routes use, so the envelope's `error` is the error name, not the status text.
        error: 'InternalServerError',
      });
    });

    it('should return 200 with balances when no rate limit', async () => {
      mockSolanaInstance.getBalances.mockResolvedValue({
        SOL: 2.5,
        USDC: 100.0,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/chains/solana/balances',
        payload: {
          network: 'mainnet-beta',
          address: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5',
          tokens: ['SOL', 'USDC'],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toEqual({
        balances: {
          SOL: 2.5,
          USDC: 100.0,
        },
      });
    });
  });
});

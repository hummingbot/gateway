import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { fetchPoolsRoute } = await import('../../../../src/connectors/orca/clmm-routes/fetchPools');
  await server.register(fetchPoolsRoute);
  return server;
};

describe('GET /fetch-pools', () => {
  let app: ReturnType<typeof fastifyWithTypeProvider>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('successful pool fetching', () => {
    it('should fetch pools successfully', async () => {
      const mockPools = [
        {
          address: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          feeTier: 64,
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        },
        {
          address: '2AEWSvUds1wsufnsDPCXjFsJCMJH5SNNm7fSF4kxys9a',
          baseToken: 'SOL',
          quoteToken: 'USDT',
          feeTier: 64,
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        },
      ];

      const mockOrca = {
        fetchPools: jest.fn().mockResolvedValue(mockPools),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/fetch-pools',
        query: {
          network: 'mainnet-beta',
        },
      });

      expect(response.statusCode).toBe(200);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(Array.isArray(body)).toBe(true);
        expect(mockOrca.fetchPools).toHaveBeenCalled();
      }
    });

    it('should use default network if not provided', async () => {
      const mockOrca = {
        fetchPools: jest.fn().mockResolvedValue([]),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/fetch-pools',
        query: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return empty array when no pools found', async () => {
      const mockOrca = {
        fetchPools: jest.fn().mockResolvedValue([]),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/fetch-pools',
        query: {
          network: 'mainnet-beta',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      const mockOrca = {
        fetchPools: jest.fn().mockRejectedValue(new Error('Failed to fetch pools')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/fetch-pools',
        query: {
          network: 'mainnet-beta',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/fetch-pools',
        query: {
          network: 'mainnet-beta',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid network', async () => {
      const mockOrca = {
        fetchPools: jest.fn().mockRejectedValue(new Error('Invalid network')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/fetch-pools',
        query: {
          network: 'invalid-network',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

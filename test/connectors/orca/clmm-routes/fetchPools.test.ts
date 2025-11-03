import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana', () => ({
  Solana: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../../../src/connectors/orca/orca', () => ({
  Orca: {
    getInstance: jest.fn(),
  },
}));

jest.mock('../../../../src/chains/solana/solana.config', () => ({
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
  }),
}));

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

  afterAll(async () => {
    await app.close();
  });

  describe('successful pool fetching', () => {
    it('should fetch pools successfully', async () => {
      const mockPools = [
        {
          address: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          binStep: 64,
          feePct: 0.25,
          price: 150.5,
          baseTokenAmount: 1000,
          quoteTokenAmount: 150500,
          activeBinId: 12345,
        },
        {
          address: '2AEWSvUds1wsufnsDPCXjFsJCMJH5SNNm7fSF4kxys9a',
          baseTokenAddress: 'So11111111111111111111111111111111111111112',
          quoteTokenAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          binStep: 64,
          feePct: 0.25,
          price: 148.2,
          baseTokenAmount: 2000,
          quoteTokenAmount: 296400,
          activeBinId: 12340,
        },
      ];

      const mockOrca = {
        getPools: jest.fn().mockResolvedValue(mockPools),
      };
      const mockSolana = {
        getToken: jest.fn().mockResolvedValue({ symbol: 'SOL' }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

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
        expect(mockOrca.getPools).toHaveBeenCalled();
      }
    });

    it('should use default network if not provided', async () => {
      const mockOrca = {
        getPools: jest.fn().mockResolvedValue([]),
      };
      const mockSolana = {
        getToken: jest.fn().mockResolvedValue({ symbol: 'SOL' }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const response = await app.inject({
        method: 'GET',
        url: '/fetch-pools',
        query: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return empty array when no pools found', async () => {
      const mockOrca = {
        getPools: jest.fn().mockResolvedValue([]),
      };
      const mockSolana = {
        getToken: jest.fn().mockResolvedValue({ symbol: 'SOL' }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

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
        getPools: jest.fn().mockRejectedValue(new Error('Failed to fetch pools')),
      };
      const mockSolana = {
        getToken: jest.fn().mockResolvedValue({ symbol: 'SOL' }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

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
        getPools: jest.fn().mockRejectedValue(new Error('Invalid network')),
      };
      const mockSolana = {
        getToken: jest.fn().mockResolvedValue({ symbol: 'SOL' }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

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

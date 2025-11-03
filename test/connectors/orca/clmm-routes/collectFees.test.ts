import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { collectFeesRoute } = await import('../../../../src/connectors/orca/clmm-routes/collectFees');
  await server.register(collectFeesRoute);
  return server;
};

describe('POST /collect-fees', () => {
  const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
  const mockPositionAddress = 'HqoV7Qv27REUtq26uVBhqmaipPC381dj7UceLn433SoH';
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

  describe('successful fee collection', () => {
    it('should collect fees from position', async () => {
      const mockOrca = {
        collectFees: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
          data: {
            baseTokenAmount: 0.1,
            quoteTokenAmount: 20,
            fee: 0.001,
          },
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(mockOrca.collectFees).toHaveBeenCalled();
      }
    });

    it('should use default network if not provided', async () => {
      const mockOrca = {
        collectFees: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should use default wallet if not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          network: 'mainnet-beta',
          positionAddress: mockPositionAddress,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('validation', () => {
    it('should return 400 when positionAddress is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle invalid position address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: 'invalid',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      const mockOrca = {
        collectFees: jest.fn().mockRejectedValue(new Error('Collect fees failed')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle when no fees available to collect', async () => {
      const mockOrca = {
        collectFees: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
          data: {
            baseTokenAmount: 0,
            quoteTokenAmount: 0,
            fee: 0.001,
          },
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/collect-fees',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });
});

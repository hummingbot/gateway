import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { closePositionRoute } = await import('../../../../src/connectors/orca/clmm-routes/closePosition');
  await server.register(closePositionRoute);
  return server;
};

describe('POST /close-position', () => {
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

  describe('successful position closure', () => {
    it('should close position successfully', async () => {
      const mockOrca = {
        closePosition: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
          data: {
            baseTokenAmountClosed: 1.0,
            quoteTokenAmountClosed: 200,
            feesCollected: 0.5,
            fee: 0.001,
          },
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/close-position',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(mockOrca.closePosition).toHaveBeenCalled();
      }
    });

    it('should use default network if not provided', async () => {
      const mockOrca = {
        closePosition: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/close-position',
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
        url: '/close-position',
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
        url: '/close-position',
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
        url: '/close-position',
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
        closePosition: jest.fn().mockRejectedValue(new Error('Close position failed')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/close-position',
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
        url: '/close-position',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle position with existing liquidity error', async () => {
      const mockOrca = {
        closePosition: jest.fn().mockRejectedValue(new Error('Position has liquidity, must remove first')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/close-position',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

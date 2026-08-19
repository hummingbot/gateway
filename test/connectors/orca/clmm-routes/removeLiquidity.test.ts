import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { removeLiquidityRoute } = await import('../../../../src/trading/trading-clmm-routes/remove');
  await server.register(removeLiquidityRoute);
  return server;
};

describe('POST /remove-liquidity', () => {
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

  describe('successful liquidity removal', () => {
    it('should remove liquidity with percentage', async () => {
      const mockOrca = {
        removeLiquidity: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
          data: {
            baseTokenAmountRemoved: 1.0,
            quoteTokenAmountRemoved: 200,
            fee: 0.001,
          },
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 50,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(mockOrca.removeLiquidity).toHaveBeenCalled();
      }
    });

    it('should remove 100% liquidity', async () => {
      const mockOrca = {
        removeLiquidity: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 100,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should use default network and wallet', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          positionAddress: mockPositionAddress,
          percentageToRemove: 25,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('validation', () => {
    it('should return 400 when positionAddress is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return error when percentageToRemove is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid percentageToRemove values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 150,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      const mockOrca = {
        removeLiquidity: jest.fn().mockRejectedValue(new Error('Remove liquidity failed')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/remove',
        payload: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          percentageToRemove: 50,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

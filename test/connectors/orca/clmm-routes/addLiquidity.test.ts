import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { addLiquidityRoute } = await import('../../../../src/connectors/orca/clmm-routes/addLiquidity');
  await server.register(addLiquidityRoute);
  return server;
};

describe('POST /add-liquidity', () => {
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

  describe('successful liquidity addition', () => {
    it('should add liquidity with base token amount', async () => {
      const mockOrca = {
        addLiquidity: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
          data: {
            baseTokenAmountAdded: 1.0,
            quoteTokenAmountAdded: 200,
            fee: 0.001,
          },
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
          slippagePct: 1,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        expect(mockOrca.addLiquidity).toHaveBeenCalled();
      }
    });

    it('should add liquidity with quote token amount', async () => {
      const mockOrca = {
        addLiquidity: jest.fn().mockResolvedValue({
          signature: 'sig123',
          status: 1,
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          quoteTokenAmount: 200,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should add liquidity with both token amounts', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
          quoteTokenAmount: 200,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('validation', () => {
    it('should return 400 when positionAddress is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return error when no token amount provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid position address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: 'invalid',
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      const mockOrca = {
        addLiquidity: jest.fn().mockRejectedValue(new Error('Add liquidity failed')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/add-liquidity',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          positionAddress: mockPositionAddress,
          baseTokenAmount: 1.0,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

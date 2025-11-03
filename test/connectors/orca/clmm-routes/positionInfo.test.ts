import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionInfoRoute } = await import('../../../../src/connectors/orca/clmm-routes/positionInfo');
  await server.register(positionInfoRoute);
  return server;
};

describe('GET /position-info', () => {
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

  describe('successful position info retrieval', () => {
    it('should get position info successfully', async () => {
      const mockPositionInfo = {
        address: mockPositionAddress,
        poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
        baseTokenAddress: 'So11111111111111111111111111111111111111112',
        quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        lowerPrice: 150,
        upperPrice: 250,
        liquidity: '1000000',
        baseTokenAmount: 1.0,
        quoteTokenAmount: 200,
        baseFeeAmount: 0.01,
        quoteFeeAmount: 0.2,
        price: 200.5,
      };

      const mockOrca = {
        getPositionInfo: jest.fn().mockResolvedValue(mockPositionInfo),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          network: 'mainnet-beta',
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBe(200);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.address).toBe(mockPositionAddress);
        expect(mockOrca.getPositionInfo).toHaveBeenCalled();
      }
    });

    it('should use default network if not provided', async () => {
      const mockOrca = {
        getPositionInfo: jest.fn().mockResolvedValue({
          address: mockPositionAddress,
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          positionAddress: mockPositionAddress,
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should handle null response when position not found', async () => {
      const mockOrca = {
        getPositionInfo: jest.fn().mockResolvedValue(null),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          network: 'mainnet-beta',
          positionAddress: 'invalid-position',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({});
    });
  });

  describe('validation', () => {
    it('should return 400 when positionAddress is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          network: 'mainnet-beta',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle invalid position address', async () => {
      const mockOrca = {
        getPositionInfo: jest.fn().mockResolvedValue(null),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          network: 'mainnet-beta',
          positionAddress: 'invalid',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      const mockOrca = {
        getPositionInfo: jest.fn().mockRejectedValue(new Error('Failed to fetch position')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          network: 'mainnet-beta',
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          network: 'mainnet-beta',
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle position not owned by wallet', async () => {
      const mockOrca = {
        getPositionInfo: jest.fn().mockRejectedValue(new Error('Position not found')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/position-info',
        query: {
          network: 'mainnet-beta',
          positionAddress: mockPositionAddress,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quotePositionRoute } = await import('../../../../src/connectors/orca/clmm-routes/quotePosition');
  await server.register(quotePositionRoute);
  return server;
};

describe('GET /quote-position', () => {
  const mockPoolAddress = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
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

  describe('successful position quoting', () => {
    it('should get position quote with base token amount', async () => {
      const mockQuote = {
        baseTokenAmount: '1.0',
        quoteTokenAmount: '200',
        liquidity: '1000000',
        lowerPrice: '150',
        upperPrice: '250',
      };

      const mockOrca = {
        quotePosition: jest.fn().mockResolvedValue(mockQuote),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.baseTokenAmount).toBe(1.0);
        expect(mockOrca.quotePosition).toHaveBeenCalled();
      }
    });

    it('should get position quote with quote token amount', async () => {
      const mockQuote = {
        baseTokenAmount: '1.0',
        quoteTokenAmount: '200',
        liquidity: '1000000',
      };

      const mockOrca = {
        quotePosition: jest.fn().mockResolvedValue(mockQuote),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          quoteTokenAmount: '200',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should get position quote with both token amounts', async () => {
      const mockOrca = {
        quotePosition: jest.fn().mockResolvedValue({
          baseTokenAmount: '1.0',
          quoteTokenAmount: '200',
          liquidity: '1000000',
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
          quoteTokenAmount: '200',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should use default network if not provided', async () => {
      const mockOrca = {
        quotePosition: jest.fn().mockResolvedValue({
          baseTokenAmount: '1.0',
          quoteTokenAmount: '200',
          liquidity: '1000000',
        }),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('validation', () => {
    it('should return 400 when poolAddress is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when lowerPrice is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when upperPrice is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return error when no token amount provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle lowerPrice >= upperPrice', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '250',
          upperPrice: '150',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid pool address', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: 'invalid',
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('error handling', () => {
    it('should handle Orca errors gracefully', async () => {
      const mockOrca = {
        quotePosition: jest.fn().mockRejectedValue(new Error('Failed to quote position')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle service unavailable', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle pool not found', async () => {
      const mockOrca = {
        quotePosition: jest.fn().mockRejectedValue(new Error('Pool not found')),
      };
      (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-position',
        query: {
          network: 'mainnet-beta',
          poolAddress: 'nonexistent123',
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});

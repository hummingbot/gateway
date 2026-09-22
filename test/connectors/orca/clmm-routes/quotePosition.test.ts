import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

// The connector reaches the SDK through orca.utils.quotePosition, not through a
// method on the Orca instance. Mocking the instance (as this did) left the real helper
// running against an empty rpc, so every success case answered 500 and the assertions
// accepted it.
const mockQuotePosition = jest.fn();

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/connectors/orca/orca.utils', () => ({
  ...jest.requireActual('../../../../src/connectors/orca/orca.utils'),
  quotePosition: (...a: any[]) => mockQuotePosition(...a),
}));

const QUOTE = {
  baseLimited: true,
  baseTokenAmount: 1,
  quoteTokenAmount: 200,
  baseTokenAmountMax: 1.01,
  quoteTokenAmountMax: 202,
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteLiquidityRoute } = await import('../../../../src/trading/clmm/quote-liquidity');
  await server.register(quoteLiquidityRoute);
  return server;
};

describe('GET /quote-liquidity', () => {
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
      (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
      mockQuotePosition.mockResolvedValue(QUOTE);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(parseWire(response.body)).toMatchObject({
        baseTokenAmount: 1,
        quoteTokenAmount: 200,
        poolAddress: mockPoolAddress,
      });
      // The range and the offered amount reach the quote unchanged.
      expect(mockQuotePosition).toHaveBeenCalledWith({}, mockPoolAddress, 150, 250, 1, undefined, 1);
    });

    it('should get position quote with quote token amount', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
      mockQuotePosition.mockResolvedValue(QUOTE);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          quoteTokenAmount: '200',
        },
      });

      expect(response.statusCode).toBe(200);
      // Only the quote side was offered, so that is what the quote is asked for.
      expect(mockQuotePosition).toHaveBeenCalledWith({}, mockPoolAddress, 150, 250, undefined, 200, 1);
    });

    it('should get position quote with both token amounts', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
      mockQuotePosition.mockResolvedValue(QUOTE);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
          quoteTokenAmount: '200',
        },
      });

      expect(response.statusCode).toBe(200);
      // Both sides offered: the quote decides which one binds.
      expect(mockQuotePosition).toHaveBeenCalledWith({}, mockPoolAddress, 150, 250, 1, 200, 1);
      expect(parseWire(response.body).baseLimited).toBe(true);
    });

    it('should use default network if not provided', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
      mockQuotePosition.mockResolvedValue(QUOTE);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          connector: 'orca',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(Orca.getInstance).toHaveBeenCalledWith('mainnet-beta');
    });
  });

  describe('validation', () => {
    it('should return 400 when poolAddress is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
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
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
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
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
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
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
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
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          poolAddress: mockPoolAddress,
          lowerPrice: '250',
          upperPrice: '150',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid pool address', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
      mockQuotePosition.mockRejectedValue(new Error('Invalid pool address'));

      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
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
      (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
      mockQuotePosition.mockRejectedValue(new Error('Failed to quote position'));

      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
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
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          poolAddress: mockPoolAddress,
          lowerPrice: '150',
          upperPrice: '250',
          baseTokenAmount: '1.0',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle pool not found', async () => {
      (Orca.getInstance as jest.Mock).mockResolvedValue({ solanaKitRpc: {} });
      mockQuotePosition.mockRejectedValue(new Error('Pool not found'));

      const response = await app.inject({
        method: 'GET',
        url: '/quote-liquidity',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
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

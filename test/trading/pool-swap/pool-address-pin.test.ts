import { tradingClmmRoutes, tradingRouterRoutes } from '../../../src/trading/trading.routes';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

// The pool-scoped swap routes resolve a pool from Gateway's configured pool list
// by token pair. A pool that is not in that list — a freshly created one, or one
// on an unlisted token — is unreachable that way, so callers can pin it by address.
// The router surface has no pool to pin: it picks its own route across pools, which
// is now expressed by /trading/router carrying no poolAddress parameter at all.

const mockGetPool = jest.fn();

jest.mock('../../../src/services/pool-service', () => ({
  PoolService: {
    getInstance: () => ({
      getPool: (...args: any[]) => mockGetPool(...args),
    }),
  },
}));

const mockMeteoraClmmQuoteSwap = jest.fn();
jest.mock('../../../src/connectors/meteora/clmm-routes/quoteSwap', () => ({
  quoteSwap: (...args: any[]) => mockMeteoraClmmQuoteSwap(...args),
}));

const mockJupiterRouterQuoteSwap = jest.fn();
jest.mock('../../../src/connectors/jupiter/router-routes/quoteSwap', () => ({
  quoteSwap: (...args: any[]) => mockJupiterRouterQuoteSwap(...args),
}));

jest.mock('../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../src/chains/solana/solana.config'),
  getSolanaNetworkConfig: () => ({ swapProvider: 'jupiter/router' }),
}));

const PINNED_POOL = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

const QUOTE = {
  // Router quotes carry the id that /trading/router/execute-quote takes; the
  // response schema requires it, so a quote without one fails serialization.
  quoteId: 'quote-1',
  tokenIn: 'So11111111111111111111111111111111111111112',
  tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amountIn: 1,
  amountOut: 100,
  price: 100,
  minAmountOut: 99,
  maxAmountIn: 1,
  priceImpactPct: 0.1,
};

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  await server.register(tradingClmmRoutes, { prefix: '/trading/clmm' });
  await server.register(tradingRouterRoutes, { prefix: '/trading/router' });
  return server;
};

const url = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams(params).toString()}`;

const clmmQuote = (params: Record<string, string>) => url('/trading/clmm/quote-swap', params);
const routerQuote = (params: Record<string, string>) => url('/trading/router/quote-swap', params);

describe('Pool-scoped swap quote — poolAddress pin', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMeteoraClmmQuoteSwap.mockResolvedValue(QUOTE);
    mockJupiterRouterQuoteSwap.mockResolvedValue(QUOTE);
  });

  it('uses the pinned pool without consulting the configured pool list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: clmmQuote({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
        poolAddress: PINNED_POOL,
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetPool).not.toHaveBeenCalled();
    expect(mockMeteoraClmmQuoteSwap).toHaveBeenCalledWith('mainnet-beta', PINNED_POOL, 'SOL', 'SELL', 1, undefined);
  });

  it('falls back to the configured pool list when no pin is given', async () => {
    mockGetPool.mockResolvedValue({ address: PINNED_POOL });

    const response = await app.inject({
      method: 'GET',
      url: clmmQuote({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetPool).toHaveBeenCalledWith('solana', 'mainnet-beta', 'clmm', 'SOL', 'USDC', 'meteora');
  });

  it('tells an unresolvable pair that a pin is available', async () => {
    mockGetPool.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: clmmQuote({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        baseToken: 'NEWMINT',
        quoteToken: 'SOL',
        amount: '1',
        side: 'SELL',
      }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('poolAddress');
  });

  // The type now lives in the path, so `connector` is a bare, enum-constrained name.
  // The old "connector/type" form is rejected at the schema rather than tolerated:
  // an enum keeps the accepted set in the spec, which is what a generated client reads.
  it.each(['meteora/clmm', 'jupiter/router'])('rejects the old connector/type form (%s)', async (connector) => {
    const response = await app.inject({
      method: 'GET',
      url: clmmQuote({
        chainNetwork: 'solana-mainnet-beta',
        connector,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
        poolAddress: PINNED_POOL,
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('connector');
  });

  it('rejects a connector that is not a CLMM connector', async () => {
    const response = await app.inject({
      method: 'GET',
      url: clmmQuote({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
      }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('routes through the router surface without ever consulting the pool list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: routerQuote({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockGetPool).not.toHaveBeenCalled();
    expect(mockJupiterRouterQuoteSwap).toHaveBeenCalled();
  });

  it("uses the network's configured swapProvider when no connector is named", async () => {
    const response = await app.inject({
      method: 'GET',
      url: routerQuote({
        chainNetwork: 'solana-mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockJupiterRouterQuoteSwap).toHaveBeenCalled();
  });
});

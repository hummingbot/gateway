import { tradingSwapRoutes } from '../../../src/trading/trading.routes';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

// The unified swap route resolves a pool from Gateway's configured pool list by
// token pair. A pool that is not in that list — a freshly created one, or one on
// an unlisted token — is unreachable that way, so callers can pin it by address.
// Routers choose their own route across pools and must reject the pin outright.

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
  await server.register(tradingSwapRoutes, { prefix: '/trading/swap' });
  return server;
};

const quoteUrl = (params: Record<string, string>) => `/trading/swap/quote?${new URLSearchParams(params).toString()}`;

describe('Unified swap quote — poolAddress pin', () => {
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
      url: quoteUrl({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora/clmm',
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
      url: quoteUrl({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora/clmm',
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
      url: quoteUrl({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora/clmm',
        baseToken: 'NEWMINT',
        quoteToken: 'SOL',
        amount: '1',
        side: 'SELL',
      }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('poolAddress');
  });

  it('rejects a pin on a router provider, which picks its own route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: quoteUrl({
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter/router',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
        poolAddress: PINNED_POOL,
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('poolAddress is not supported');
    expect(mockJupiterRouterQuoteSwap).not.toHaveBeenCalled();
  });
});

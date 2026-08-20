/**
 * A swap teaches Gateway the pool and tokens it ran against.
 *
 * The service that does the recording is covered in
 * test/services/token-pool-autosave.test.ts. What these assert is that the trading
 * routes actually reach it, and reach it with the pool they really used — a pinned
 * address rather than the pair the caller named, which is the whole reason the pin
 * exists and the only thing worth recording.
 */
const mockEnsurePoolSaved = jest.fn().mockResolvedValue(undefined);
const mockEnsureTokenSaved = jest.fn().mockResolvedValue(null);

// Only the two recording functions are stubbed. recordQuietly stays real, because the
// guarantee it makes — that a failed write cannot fail the request — is one of the things
// under test here, and a stub of it would assert itself.
jest.mock('../../../src/services/token-pool-autosave', () => ({
  ...jest.requireActual('../../../src/services/token-pool-autosave'),
  ensurePoolSaved: (...args: any[]) => mockEnsurePoolSaved(...args),
  ensureTokenSaved: (...args: any[]) => mockEnsureTokenSaved(...args),
}));

const mockGetPool = jest.fn();
jest.mock('../../../src/services/pool-service', () => ({
  PoolService: { getInstance: () => ({ getPool: (...args: any[]) => mockGetPool(...args) }) },
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

import { tradingClmmRoutes, tradingRouterRoutes } from '../../../src/trading/trading.routes';
import { fastifyWithTypeProvider } from '../../utils/testUtils';

const PINNED_POOL = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const POOL_QUOTE = {
  poolAddress: PINNED_POOL,
  tokenIn: SOL,
  tokenOut: USDC,
  amountIn: 1,
  amountOut: 100,
  price: 100,
  minAmountOut: 99,
  maxAmountIn: 1,
  priceImpactPct: 0.1,
};

const ROUTER_QUOTE = { ...POOL_QUOTE, quoteId: 'quote-1', poolAddress: undefined };

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  await server.register(tradingClmmRoutes, { prefix: '/trading/clmm' });
  await server.register(tradingRouterRoutes, { prefix: '/trading/router' });
  return server;
};

const url = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams(params).toString()}`;

describe('a swap records what it traded against', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsurePoolSaved.mockResolvedValue(undefined);
    mockEnsureTokenSaved.mockResolvedValue(null);
  });

  it('records the pinned pool a CLMM quote used, not the pair it was asked for', async () => {
    mockMeteoraClmmQuoteSwap.mockResolvedValue(POOL_QUOTE);

    const response = await app.inject({
      method: 'GET',
      url: url('/trading/clmm/quote-swap', {
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
    expect(mockEnsurePoolSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'solana',
        network: 'mainnet-beta',
        connector: 'meteora',
        type: 'clmm',
        poolAddress: PINNED_POOL,
      }),
    );
    // The pool list was never consulted for a pair, because a pin skips that lookup.
    expect(mockGetPool).not.toHaveBeenCalled();
  });

  // A router picks its own path across pools, so there is no pool to record — only the
  // two tokens the caller named, which is the one chance to learn an unlisted address.
  it('records both tokens of a router quote, and no pool', async () => {
    mockJupiterRouterQuoteSwap.mockResolvedValue(ROUTER_QUOTE);

    const response = await app.inject({
      method: 'GET',
      url: url('/trading/router/quote-swap', {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'jupiter',
        baseToken: SOL,
        quoteToken: USDC,
        amount: '1',
        side: 'SELL',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockEnsureTokenSaved).toHaveBeenCalledWith('solana', 'mainnet-beta', SOL);
    expect(mockEnsureTokenSaved).toHaveBeenCalledWith('solana', 'mainnet-beta', USDC);
    expect(mockEnsurePoolSaved).not.toHaveBeenCalled();
  });

  // Recording is bookkeeping. A quote that priced correctly has answered the caller's
  // question, and must not be reported as failed because the write behind it did not.
  it('answers the caller even when recording fails', async () => {
    mockMeteoraClmmQuoteSwap.mockResolvedValue(POOL_QUOTE);
    mockEnsurePoolSaved.mockRejectedValue(new Error('pool list unwritable'));

    const response = await app.inject({
      method: 'GET',
      url: url('/trading/clmm/quote-swap', {
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
  });
});

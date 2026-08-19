import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { MeteoraDamm } from '../../../../src/connectors/meteora/meteora-damm';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/meteora/meteora-damm');

const mockPoolAddress = 'FH6mP2MUobhDnLERp9z5yv5t2zMUA9WDNXPixpbvYKMv';
const mockSOL = 'So11111111111111111111111111111111111111112';
const mockUSDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { makeQuoteSwapRoute } = await import('../../../../src/trading/pool-swap-routes');
  await server.register(makeQuoteSwapRoute('amm'));
  return server;
};

// A DAMM v2 pool where token A = SOL (9 decimals), token B = USDC (6 decimals).
const buildMockInstance = (getQuote2: jest.Mock) => ({
  solana: {
    getToken: jest.fn((t: string) => {
      if (t === 'SOL' || t === mockSOL) return Promise.resolve({ address: mockSOL, decimals: 9, symbol: 'SOL' });
      if (t === 'USDC' || t === mockUSDC) return Promise.resolve({ address: mockUSDC, decimals: 6, symbol: 'USDC' });
      return Promise.resolve(null);
    }),
    connection: {
      getSlot: jest.fn().mockResolvedValue(100),
      getBlockTime: jest.fn().mockResolvedValue(1700000000),
    },
  },
  getPoolState: jest.fn().mockResolvedValue({
    tokenAMint: new PublicKey(mockSOL),
    tokenBMint: new PublicKey(mockUSDC),
  }),
  getTokenDecimals: jest.fn().mockResolvedValue({ tokenADecimal: 9, tokenBDecimal: 6 }),
  getCurrentPoint: jest.fn().mockReturnValue(new BN(1700000000)),
  cpAmm: { getQuote2 },
});

describe('GET /quote-swap (Meteora DAMM v2)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('quotes a SELL (exact-in) of the base token', async () => {
    // Sell 0.1 SOL -> 14.85 USDC out (min 14.7 with slippage).
    const getQuote2 = jest.fn().mockReturnValue({
      outputAmount: new BN(14_850_000),
      minimumAmountOut: new BN(14_700_000),
      priceImpact: { toString: () => '1' },
    });
    (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue(buildMockInstance(getQuote2));

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(getQuote2).toHaveBeenCalledWith(expect.objectContaining({ swapMode: 0 })); // ExactIn
    expect(body).toMatchObject({
      poolAddress: mockPoolAddress,
      tokenIn: mockSOL,
      tokenOut: mockUSDC,
      amountIn: 0.1,
      amountOut: 14.85,
      minAmountOut: 14.7,
      maxAmountIn: 0.1,
      price: 148.5,
      priceImpactPct: 1,
      slippagePct: 1,
    });
  });

  it('quotes a BUY (exact-out) of the base token', async () => {
    // Buy 0.1 SOL for ~15 USDC in (max 15.15 with slippage).
    const getQuote2 = jest.fn().mockReturnValue({
      includedFeeInputAmount: new BN(15_000_000),
      maximumAmountIn: new BN(15_150_000),
      priceImpact: { toString: () => '1' },
    });
    (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue(buildMockInstance(getQuote2));

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(getQuote2).toHaveBeenCalledWith(expect.objectContaining({ swapMode: 2 })); // ExactOut
    expect(body).toMatchObject({
      poolAddress: mockPoolAddress,
      tokenIn: mockUSDC,
      tokenOut: mockSOL,
      amountIn: 15,
      amountOut: 0.1,
      maxAmountIn: 15.15,
      minAmountOut: 0.1,
      price: 150,
      priceImpactPct: 1,
      slippagePct: 1,
    });
  });

  it('rejects a base token that is not in the pool', async () => {
    const getQuote2 = jest.fn();
    (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue(buildMockInstance(getQuote2));

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        poolAddress: mockPoolAddress,
        baseToken: 'Es9vMFrzaCERmJfrF4H2FYD4KCon15JpFuLYc7uGZa9K', // USDT, not in pool
        amount: '0.1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(getQuote2).not.toHaveBeenCalled();
  });
});

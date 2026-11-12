/**
 * Pure-math coverage of getPumpSwapQuote: orientation (pool-base vs pool-quote
 * as the request's baseToken), side handling, and that the returned plan's
 * on-chain bound matches the quoted min/max.
 */
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { getPumpSwapQuote } from '../../../src/connectors/pump/amm-routes/quoteSwap';

const BASE_MINT = PublicKey.unique();
const QUOTE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
  [BASE_MINT.toBase58()]: { address: BASE_MINT.toBase58(), symbol: 'MEME', decimals: 6 },
  [QUOTE_MINT.toBase58()]: { address: QUOTE_MINT.toBase58(), symbol: 'SOL', decimals: 9 },
};

const fakePump: any = {
  getTokenInfo: jest.fn(async (addressOrSymbol: string) => {
    const token = TOKENS[addressOrSymbol];
    if (!token) throw new Error(`Token not found: ${addressOrSymbol}`);
    return token;
  }),
};

// 1M MEME (6dp) against 100 SOL (9dp), no virtual reserves, flat 30bps fees,
// no coin creator (so no creator fee).
const state: any = {
  poolKey: PublicKey.unique(),
  pool: {
    baseMint: BASE_MINT,
    quoteMint: QUOTE_MINT,
    creator: PublicKey.unique(),
    coinCreator: PublicKey.default,
    virtualQuoteReserves: new BN(0),
    lpSupply: new BN('1000000000'),
  },
  poolBaseAmount: new BN('1000000000000'), // 1,000,000 MEME
  poolQuoteAmount: new BN('100000000000'), // 100 SOL
  baseMint: BASE_MINT,
  baseMintAccount: { supply: BigInt('1000000000000000') },
  globalConfig: {
    lpFeeBasisPoints: new BN(20),
    protocolFeeBasisPoints: new BN(10),
    coinCreatorFeeBasisPoints: new BN(5),
  },
  feeConfig: null,
};

const SPOT = 100 / 1_000_000; // SOL per MEME

describe('getPumpSwapQuote', () => {
  it('BUY of the pool base is exact-out with a bounded max cost', async () => {
    const q = await getPumpSwapQuote(fakePump, state, BASE_MINT.toBase58(), 'BUY', 1000, 1);

    expect(q.tokenIn.symbol).toBe('SOL');
    expect(q.tokenOut.symbol).toBe('MEME');
    expect(q.amountOut).toBe(1000);
    expect(q.minAmountOut).toBe(1000);
    // ~0.1 SOL for 1000 MEME plus 30bps fees and a hair of curve impact.
    expect(q.amountIn).toBeGreaterThan(1000 * SPOT);
    expect(q.amountIn).toBeLessThan(1000 * SPOT * 1.01);
    // Bound = quoted maxAmountIn, expressed in raw quote units in the plan.
    expect(q.maxAmountIn).toBeCloseTo(q.plan.bound.toNumber() / 1e9, 9);
    expect(q.plan.instruction).toBe('buy');
    expect(q.plan.baseAmount.toString()).toBe('1000000000');
    expect(q.priceImpactPct).toBeCloseTo((1000 / (1_000_000 - 1000)) * 100, 4);
  });

  it('SELL of the pool base is exact-in with a bounded min output', async () => {
    const q = await getPumpSwapQuote(fakePump, state, BASE_MINT.toBase58(), 'SELL', 1000, 1);

    expect(q.tokenIn.symbol).toBe('MEME');
    expect(q.tokenOut.symbol).toBe('SOL');
    expect(q.amountIn).toBe(1000);
    expect(q.amountOut).toBeLessThan(1000 * SPOT);
    expect(q.amountOut).toBeGreaterThan(1000 * SPOT * 0.99);
    expect(q.minAmountOut).toBeCloseTo(q.plan.bound.toNumber() / 1e9, 9);
    expect(q.plan.instruction).toBe('sell');
    expect(q.minAmountOut).toBeLessThan(q.amountOut);
  });

  it('supports the pool-quote token as the request base (SELL SOL = buy MEME)', async () => {
    const q = await getPumpSwapQuote(fakePump, state, QUOTE_MINT.toBase58(), 'SELL', 0.1, 1);

    expect(q.tokenIn.symbol).toBe('SOL');
    expect(q.tokenOut.symbol).toBe('MEME');
    expect(q.amountIn).toBe(0.1);
    // 0.1 SOL buys ~1000 MEME minus fees/impact.
    expect(q.amountOut).toBeGreaterThan(900);
    expect(q.amountOut).toBeLessThan(1000);
    expect(q.plan.instruction).toBe('buy');
  });

  it('rejects a base token that is not in the pool', async () => {
    // A token Gateway knows, so it is the pool-membership check that refuses it.
    const outsider = PublicKey.unique().toBase58();
    TOKENS[outsider] = { address: outsider, symbol: 'OTHER', decimals: 6 };

    await expect(getPumpSwapQuote(fakePump, state, outsider, 'BUY', 1, 1)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/is not in pool/),
    });
  });

  it('prices against effective reserves when the pool carries virtual quote reserves', async () => {
    const virtualState = {
      ...state,
      pool: { ...state.pool, virtualQuoteReserves: new BN('100000000000') }, // +100 SOL virtual
    };
    const q = await getPumpSwapQuote(fakePump, virtualState, BASE_MINT.toBase58(), 'BUY', 1000, 1);
    // Effective quote reserve doubled, so the price roughly doubles.
    expect(q.amountIn).toBeGreaterThan(1000 * SPOT * 1.9);
    expect(q.amountIn).toBeLessThan(1000 * SPOT * 2.1);
  });
});

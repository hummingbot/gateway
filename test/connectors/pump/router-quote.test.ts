/**
 * Router quote-swap on a live bonding curve: exact-out BUY / exact-in SELL,
 * slippage bounds, the cached execution plan, and the guardrails (wrong quote
 * currency, buying more than the curve holds).
 */
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { quoteCache } from '../../../src/services/quote-cache';

jest.mock('../../../src/connectors/pump/pump', () => ({
  Pump: { getInstance: jest.fn() },
}));

import { quoteSwap } from '../../../src/connectors/pump/router-routes/quoteSwap';
import { Pump } from '../../../src/connectors/pump/pump';

const MINT = PublicKey.unique();
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
  [MINT.toBase58()]: { address: MINT.toBase58(), symbol: 'MEME', decimals: 6 },
  SOL: { address: SOL_MINT.toBase58(), symbol: 'SOL', decimals: 9 },
  [SOL_MINT.toBase58()]: { address: SOL_MINT.toBase58(), symbol: 'SOL', decimals: 9 },
  USDC: { address: PublicKey.unique().toBase58(), symbol: 'USDC', decimals: 6 },
};

// A fresh legacy curve at its initial constants, flat 1% protocol fee (no
// FeeConfig, no creator so no creator fee).
const curveState = {
  global: {
    feeBasisPoints: new BN(100),
    creatorFeeBasisPoints: new BN(30),
    mayhemModeEnabled: false,
  },
  feeConfig: null,
  bondingCurveAccountInfo: {} as any,
  bondingCurve: {
    virtualTokenReserves: new BN('1073000000000000'),
    virtualQuoteReserves: new BN('30000000000'),
    realTokenReserves: new BN('793100000000000'),
    realQuoteReserves: new BN(0),
    tokenTotalSupply: new BN('1000000000000000'),
    complete: false,
    creator: PublicKey.default,
    isMayhemMode: false,
    isCashbackCoin: false,
    quoteMint: PublicKey.default,
  },
  tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  quoteMint: SOL_MINT,
  graduated: false,
};

const fakePump: any = {
  getTokenInfo: jest.fn(async (addressOrSymbol: string) => {
    const token = TOKENS[addressOrSymbol];
    if (!token) throw new Error(`Token not found: ${addressOrSymbol}`);
    return token;
  }),
  getCurveState: jest.fn(async () => curveState),
};

beforeEach(() => {
  (Pump.getInstance as jest.Mock).mockResolvedValue(fakePump);
});

describe('pump router quoteSwap on a live curve', () => {
  it('BUY quotes exact token output with fee-inclusive SOL cost and slippage bound', async () => {
    const amount = 100_000; // tokens
    const q = await quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', amount, 'BUY', 1);

    expect(q.tokenIn).toBe(SOL_MINT.toBase58());
    expect(q.tokenOut).toBe(MINT.toBase58());
    expect(q.amountOut).toBe(amount);
    expect(q.minAmountOut).toBe(amount);

    // Curve math check: no-fee cost = t*y/(x-t)+1, plus 1% protocol fee.
    const noFeeLamports = (100_000e6 * 30e9) / (1.073e15 - 100_000e6);
    expect(q.amountIn).toBeGreaterThan(noFeeLamports / 1e9);
    expect(q.amountIn).toBeLessThan((noFeeLamports * 1.011) / 1e9);
    expect(q.maxAmountIn).toBeCloseTo(q.amountIn * 1.01, 6);

    // The cached plan carries the exact raw bound executeQuote will enforce.
    const cached = quoteCache.get(q.quoteId, 'pump');
    expect(cached.venue).toBe('curve');
    expect(cached.side).toBe('BUY');
    expect(new BN(cached.boundRaw).toNumber() / 1e9).toBeCloseTo(q.maxAmountIn, 9);
  });

  it('SELL quotes exact token input with a min-output bound', async () => {
    const amount = 100_000;
    const q = await quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', amount, 'SELL', 2);

    expect(q.tokenIn).toBe(MINT.toBase58());
    expect(q.tokenOut).toBe(SOL_MINT.toBase58());
    expect(q.amountIn).toBe(amount);
    expect(q.amountOut).toBeGreaterThan(0);
    expect(q.minAmountOut).toBeCloseTo(q.amountOut * 0.98, 6);

    const cached = quoteCache.get(q.quoteId, 'pump');
    expect(cached.venue).toBe('curve');
    expect(new BN(cached.boundRaw).toNumber() / 1e9).toBeCloseTo(q.minAmountOut, 9);
  });

  it('rejects a quoteToken that is not the curve quote currency', async () => {
    await expect(quoteSwap('mainnet-beta', MINT.toBase58(), 'USDC', 1, 'BUY', 1)).rejects.toThrow(
      /trades against|does not match/,
    );
  });

  it('rejects buying more tokens than remain on the curve', async () => {
    await expect(
      quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 900_000_000, 'BUY', 1), // > 793.1M remaining
    ).rejects.toThrow(/remain on the bonding curve/);
  });
});

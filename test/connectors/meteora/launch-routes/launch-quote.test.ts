/**
 * meteora-dbc router quoteSwap: exact-in on both sides (BUY spends quote, SELL
 * sells base), the SDK quote plumbing, the cached execution plan, and the
 * guardrails (migrated pool, wrong quote currency, overshooting the curve).
 */
import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

jest.mock('@meteora-ag/dynamic-bonding-curve-sdk', () => ({
  ...jest.requireActual('@meteora-ag/dynamic-bonding-curve-sdk'),
  getCurrentPoint: jest.fn(async () => new BN(1_700_000_000)),
}));
jest.mock('../../../../src/connectors/meteora/meteora-dbc', () => ({
  MeteoraDbc: { getInstance: jest.fn() },
}));

import { quoteSwap } from '../../../../src/connectors/meteora/launch-routes/quoteSwap';
import { MeteoraDbc } from '../../../../src/connectors/meteora/meteora-dbc';
import { quoteCache } from '../../../../src/services/quote-cache';

const MINT = PublicKey.unique();
const POOL = PublicKey.unique();
const CONFIG = PublicKey.unique();
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
  [MINT.toBase58()]: { address: MINT.toBase58(), symbol: 'CTEST', decimals: 6 },
  SOL: { address: SOL_MINT.toBase58(), symbol: 'SOL', decimals: 9 },
  [SOL_MINT.toBase58()]: { address: SOL_MINT.toBase58(), symbol: 'SOL', decimals: 9 },
  USDC: { address: PublicKey.unique().toBase58(), symbol: 'USDC', decimals: 6 },
};

const poolState = (overrides: Partial<{ isMigrated: boolean }> = {}) => ({
  poolAddress: POOL,
  pool: { poolState: { hasSwap: 0, sqrtPrice: new BN('1000000000000000000') } },
  configAddress: CONFIG,
  config: { activationType: 1, enableFirstSwapWithMinFee: 0, migrationQuoteThreshold: new BN(10e9) },
  baseMint: MINT,
  quoteMint: SOL_MINT,
  tokenProgram: PublicKey.unique(),
  baseDecimals: 6,
  quoteDecimals: 9,
  isMigrated: false,
  ...overrides,
});

// 0.5 SOL in → 1,000,000 tokens out, 1% fee taken from the input in quote.
const buyQuote = {
  includedFeeInputAmount: new BN(500_000_000),
  excludedFeeInputAmount: new BN(495_000_000),
  amountLeft: new BN(0),
  outputAmount: new BN(1_000_000_000_000),
  nextSqrtPrice: new BN(1),
  tradingFee: new BN(4_000_000),
  protocolFee: new BN(1_000_000),
  referralFee: new BN(0),
  minimumAmountOut: new BN(990_000_000_000),
};

const fakeDbc: any = {
  getTokenInfo: jest.fn(async (addressOrSymbol: string) => {
    const token = TOKENS[addressOrSymbol];
    if (!token) throw new Error(`Token not found: ${addressOrSymbol}`);
    return token;
  }),
  getPoolByBaseMint: jest.fn(async () => poolState()),
  spotPrice: jest.fn(() => 0.0000005),
  solana: { connection: {} },
  client: { pool: { swapQuote2: jest.fn(() => buyQuote) } },
};

beforeEach(() => {
  (MeteoraDbc.getInstance as jest.Mock).mockResolvedValue(fakeDbc);
  fakeDbc.getPoolByBaseMint.mockClear().mockResolvedValue(poolState());
  fakeDbc.client.pool.swapQuote2.mockClear().mockReturnValue(buyQuote);
});

describe('meteora-dbc quoteSwap', () => {
  it('BUY is exact-in of the quote token: amount is SOL spent, output is the token', async () => {
    const q = await quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0.5, 'BUY', 1);

    expect(q.tokenIn).toBe(SOL_MINT.toBase58());
    expect(q.tokenOut).toBe(MINT.toBase58());
    expect(q.amountIn).toBe(0.5);
    expect(q.maxAmountIn).toBe(0.5);
    expect(q.amountOut).toBe(1_000_000);
    expect(q.minAmountOut).toBe(990_000);
    expect(q.price).toBeCloseTo(0.5 / 1_000_000, 12);
    expect(q.poolAddress).toBe(POOL.toBase58());
    expect(q.slippagePct).toBe(1);
    // Fee-free execution 0.495 SOL / 1M = 4.95e-7 vs spot 5e-7 → 1% impact.
    expect(q.priceImpactPct).toBeCloseTo(1, 6);

    const args = fakeDbc.client.pool.swapQuote2.mock.calls[0][0];
    expect(args.swapBaseForQuote).toBe(false);
    expect(args.swapMode).toBe(SwapMode.ExactIn);
    expect(args.amountIn.toString()).toBe('500000000');
    expect(args.slippageBps).toBe(100);
    expect(args.currentPoint.toString()).toBe('1700000000');

    const cached = quoteCache.get(q.quoteId, 'meteora-dbc');
    expect(cached).toMatchObject({
      poolAddress: POOL.toBase58(),
      side: 'BUY',
      swapBaseForQuote: false,
      amountInRaw: '500000000',
      minAmountOutRaw: '990000000000',
      partialFill: false,
      tokenIn: { address: SOL_MINT.toBase58(), symbol: 'SOL' },
      tokenOut: { address: MINT.toBase58(), symbol: 'CTEST' },
    });
  });

  it('SELL is exact-in of the base token with the minimum output in SOL', async () => {
    fakeDbc.client.pool.swapQuote2.mockReturnValue({
      ...buyQuote,
      includedFeeInputAmount: new BN(2_000_000_000_000),
      excludedFeeInputAmount: new BN(2_000_000_000_000),
      outputAmount: new BN(990_000_000),
      tradingFee: new BN(8_000_000),
      protocolFee: new BN(2_000_000),
      minimumAmountOut: new BN(980_100_000),
    });

    const q = await quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 2_000_000, 'SELL', 1);

    expect(q.tokenIn).toBe(MINT.toBase58());
    expect(q.tokenOut).toBe(SOL_MINT.toBase58());
    expect(q.amountIn).toBe(2_000_000);
    expect(q.amountOut).toBe(0.99);
    expect(q.minAmountOut).toBe(0.9801);
    expect(q.price).toBeCloseTo(0.99 / 2_000_000, 15);
    // Gross output 1.0 SOL / 2M = 5e-7 = spot → no impact.
    expect(q.priceImpactPct).toBeCloseTo(0, 6);

    const args = fakeDbc.client.pool.swapQuote2.mock.calls[0][0];
    expect(args.swapBaseForQuote).toBe(true);
    expect(args.amountIn.toString()).toBe('2000000000000');
    expect(quoteCache.get(q.quoteId, 'meteora-dbc')).toMatchObject({
      side: 'SELL',
      swapBaseForQuote: true,
      amountInRaw: '2000000000000',
    });
  });

  it('applies the connector default slippage when none is given', async () => {
    await quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0.5, 'BUY');
    const args = fakeDbc.client.pool.swapQuote2.mock.calls[0][0];
    expect(args.slippageBps).toBe(200); // template slippagePct: 2
  });

  it('refuses a migrated pool and points at the meteora amm connector', async () => {
    fakeDbc.getPoolByBaseMint.mockResolvedValue(poolState({ isMigrated: true }));
    await expect(quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0.5, 'BUY', 1)).rejects.toThrow(
      /migrated to DAMM v2.*meteora amm connector/,
    );
    expect(fakeDbc.client.pool.swapQuote2).not.toHaveBeenCalled();
  });

  it('refuses a quote token that is not the pool quote mint', async () => {
    await expect(quoteSwap('mainnet-beta', MINT.toBase58(), 'USDC', 0.5, 'BUY', 1)).rejects.toThrow(
      /trades against .* quoteToken .* does not match/,
    );
  });

  it('fills a buy that completes the curve up to the threshold, leaving the rest with the buyer', async () => {
    // Exact-in cannot spend past the threshold, and a buy sized to what is left
    // falls short by the fee — so the buy that graduates a curve is a partial fill.
    fakeDbc.client.pool.swapQuote2
      .mockReturnValueOnce({ ...buyQuote, amountLeft: new BN(100_000_000) })
      .mockReturnValueOnce({ ...buyQuote, amountLeft: new BN(100_000_000) });
    const q = await quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0.5, 'BUY', 1);

    const [[exact], [partial]] = fakeDbc.client.pool.swapQuote2.mock.calls;
    expect(exact.swapMode).toBe(SwapMode.ExactIn);
    expect(partial.swapMode).toBe(SwapMode.PartialFill);
    expect(q.amountIn).toBeCloseTo(0.4, 9); // what it spends; 0.1 SOL stays with the buyer
    expect(q.price).toBeCloseTo(0.4 / 1_000_000, 12);
    expect(quoteCache.get(q.quoteId, 'meteora-dbc')).toMatchObject({ partialFill: true, amountInRaw: '500000000' });
  });

  it('quotes the partial fill when the SDK refuses the exact-in buy as past the threshold', async () => {
    fakeDbc.client.pool.swapQuote2
      .mockImplementationOnce(() => {
        throw new Error('Insufficient Liquidity');
      })
      .mockReturnValueOnce({ ...buyQuote, amountLeft: new BN(100_000_000) });
    const q = await quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0.5, 'BUY', 1);

    const [[exact], [partial]] = fakeDbc.client.pool.swapQuote2.mock.calls;
    expect(exact.swapMode).toBe(SwapMode.ExactIn);
    expect(partial.swapMode).toBe(SwapMode.PartialFill);
    expect(quoteCache.get(q.quoteId, 'meteora-dbc')).toMatchObject({ partialFill: true });
  });

  it('rethrows any other exact-in failure on a buy instead of quoting a partial fill', async () => {
    fakeDbc.client.pool.swapQuote2.mockImplementationOnce(() => {
      throw new Error('Math overflow');
    });
    await expect(quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0.5, 'BUY', 1)).rejects.toThrow('Math overflow');
    expect(fakeDbc.client.pool.swapQuote2).toHaveBeenCalledTimes(1);
  });

  it('refuses a sell the curve cannot absorb', async () => {
    fakeDbc.client.pool.swapQuote2.mockReturnValue({ ...buyQuote, amountLeft: new BN(100_000_000) });
    await expect(quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0.5, 'SELL', 1)).rejects.toThrow(
      /can be sold into this DBC pool/,
    );
  });

  it('refuses a non-positive amount and an unknown token', async () => {
    await expect(quoteSwap('mainnet-beta', MINT.toBase58(), 'SOL', 0, 'BUY', 1)).rejects.toThrow(/greater than 0/);
    await expect(quoteSwap('mainnet-beta', 'NOPE', 'SOL', 1, 'BUY', 1)).rejects.toThrow(/Token not found/);
  });
});

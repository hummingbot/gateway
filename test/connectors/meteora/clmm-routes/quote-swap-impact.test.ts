import { BN } from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Meteora } from '../../../../src/connectors/meteora/meteora';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');
jest.mock('../../../../src/connectors/meteora/meteora.config', () => ({
  MeteoraConfig: { config: { slippagePct: 1 } },
}));

// This route returned `priceImpactPct: 0, // TODO` for every quote, so a swap of any size
// through a Meteora pool claimed zero impact and a caller could not tell that from a real
// measurement. Same defect class as a hardcoded fee of 0: the number is published with
// the same confidence as one that was computed.

const SOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const USDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };

const SPOT = 100; // USDC per SOL, from the active bin

// Selling 10 SOL for 970 USDC: an executed price of 97 against a spot of 100 is 3% worse.
const SOLD = 10;
const RECEIVED = 970;

const dlmmPool = {
  tokenX: { publicKey: { toBase58: () => SOL.address }, mint: { decimals: 9 } },
  tokenY: { publicKey: { toBase58: () => USDC.address }, mint: { decimals: 6 } },
  getBinArrayForSwap: jest.fn().mockResolvedValue([]),
  getActiveBin: jest.fn().mockResolvedValue({ pricePerToken: String(SPOT) }),
  swapQuote: jest.fn().mockReturnValue({
    consumedInAmount: new BN(SOLD * 1e9),
    outAmount: new BN(RECEIVED * 1e6),
    minOutAmount: new BN(RECEIVED * 0.99 * 1e6),
  }),
  swapQuoteExactOut: jest.fn().mockReturnValue({
    inAmount: new BN(SOLD * 1e9),
    maxInAmount: new BN(SOLD * 1.01 * 1e9),
    outAmount: new BN(RECEIVED * 1e6),
  }),
};

beforeEach(() => {
  jest.clearAllMocks();
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    getToken: jest.fn((t: string) => Promise.resolve(t === SOL.address || t === 'SOL' ? SOL : USDC)),
  });
  (Meteora.getInstance as jest.Mock).mockResolvedValue({
    getDlmmPool: jest.fn().mockResolvedValue(dlmmPool),
  });
});

describe('meteora CLMM quote-swap price impact', () => {
  it('measures the quote against the pool spot price', async () => {
    const { quoteSwap } = await import('../../../../src/connectors/meteora/clmm-routes/quoteSwap');

    const quote = await quoteSwap('mainnet-beta', 'pool', 'SOL', 'SELL', SOLD);

    // 97 executed against 100 spot.
    expect(quote.priceImpactPct).toBeCloseTo(3, 6);
  });

  it('reports a percentage, not a fraction', async () => {
    const { quoteSwap } = await import('../../../../src/connectors/meteora/clmm-routes/quoteSwap');

    const quote = await quoteSwap('mainnet-beta', 'pool', 'SOL', 'SELL', SOLD);

    // The units this whole issue is about: 3 means three percent, not three hundred.
    expect(quote.priceImpactPct).toBeGreaterThan(1);
    expect(quote.priceImpactPct).toBeLessThan(10);
  });

  it('reports zero when the quote executes at spot', async () => {
    dlmmPool.getActiveBin.mockResolvedValueOnce({ pricePerToken: String(RECEIVED / SOLD) });
    const { quoteSwap } = await import('../../../../src/connectors/meteora/clmm-routes/quoteSwap');

    const quote = await quoteSwap('mainnet-beta', 'pool', 'SOL', 'SELL', SOLD);

    expect(quote.priceImpactPct).toBe(0);
  });
});

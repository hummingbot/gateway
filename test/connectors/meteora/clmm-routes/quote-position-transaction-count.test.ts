import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { quotePosition } from '../../../../src/connectors/meteora/clmm-routes/quotePosition';

jest.mock('../../../../src/connectors/meteora/meteora');
jest.mock('@meteora-ag/dlmm', () => ({
  StrategyType: { Spot: 0 },
  // The paired-amount maths is exercised elsewhere; this suite is about the counts.
  autoFillYByStrategy: jest.fn(() => ({ toString: () => '0' })),
  autoFillXByStrategy: jest.fn(() => ({ toString: () => '0' })),
}));

// `transactionCount` is a promise about what open-position will send, so it has to be the
// number the open actually sends. The SDK's quoteCreatePosition counts deposit chunks only
// — ceil(bins / DEFAULT_BIN_PER_POSITION) — and says nothing about creating the position,
// which openPosition sends as its own transaction whenever the range is chunked. Quoting
// the SDK's number unchanged under-reports a wide open by exactly one transaction.

const POOL = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6';
const CHUNK = 70; // DEFAULT_BIN_PER_POSITION

const primePool = (width: number) => {
  const minBinId = 0;
  const maxBinId = width - 1;
  const dlmmPool = {
    tokenX: { mint: { decimals: 9 } },
    tokenY: { mint: { decimals: 6 } },
    lbPair: { binStep: 20 },
    toPricePerLamport: jest.fn((p: number) => String(p)),
    getBinIdFromPrice: jest.fn((p: number) => (p <= 1 ? minBinId : maxBinId)),
    getActiveBin: jest.fn().mockResolvedValue({ binId: 0, xAmount: '0', yAmount: '0' }),
    // Mirrors the SDK: deposit chunks only.
    quoteCreatePosition: jest.fn().mockResolvedValue({
      positionCount: 1,
      transactionCount: Math.ceil(width / CHUNK),
    }),
  };
  (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(dlmmPool) });
  return dlmmPool;
};

describe('meteora quote-liquidity transaction count', () => {
  beforeEach(() => jest.clearAllMocks());

  it('quotes one transaction for a range that opens and funds together', async () => {
    primePool(Meteora.MAX_POSITION_BIN_WIDTH);

    const quote = await quotePosition('mainnet-beta', 1, 2, POOL, 1, undefined);

    expect(quote.transactionCount).toBe(1);
    expect(quote.positionCount).toBe(1);
  });

  it('counts the position-creation transaction once the range is chunked', async () => {
    // Just over the threshold: one deposit chunk, plus the separate create.
    primePool(Meteora.MAX_POSITION_BIN_WIDTH + 1);

    const quote = await quotePosition('mainnet-beta', 1, 2, POOL, 1, undefined);

    expect(quote.transactionCount).toBe(2);
  });

  it('matches what open-position sends for a wide range', async () => {
    // 200 bins -> ceil(200/70) = 3 deposit chunks, plus the create = 4.
    primePool(200);

    const quote = await quotePosition('mainnet-beta', 1, 2, POOL, 1, undefined);

    expect(quote.transactionCount).toBe(1 + Math.ceil(200 / CHUNK));
    expect(quote.transactionCount).toBe(4);
  });
});

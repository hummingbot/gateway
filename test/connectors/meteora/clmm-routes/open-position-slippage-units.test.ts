import { Keypair, PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { openPosition } from '../../../../src/connectors/meteora/clmm-routes/openPosition';
import { Meteora } from '../../../../src/connectors/meteora/meteora';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');

// The DLMM SDK takes slippage as a PERCENTAGE on both deposit paths, and defends itself
// with capSlippagePercentage(), which clamps at 100 — at which point
// getSlippageMaxAmount() returns U64_MAX and the deposit has no ceiling at all.
//
// This route used to convert to basis points (slippagePct * 100) before calling the
// single-transaction builder. At the template default of 2% that handed the SDK 200,
// clamped to 100, so every narrow-range open ran with slippage protection switched off;
// any slippagePct >= 1 did the same. The chunked builder was always given the percentage,
// so the two halves of one route disagreed about the unit.
//
// Pinned here: both paths pass the percentage through unscaled.

const POOL = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6';
const WALLET = 'DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9';

const ix = () => new TransactionInstruction({ keys: [], programId: SystemProgram.programId, data: Buffer.alloc(0) });

const buildPool = (width: number) => {
  const minBinId = 0;
  const maxBinId = width - 1;
  return {
    tokenX: { publicKey: new PublicKey('11111111111111111111111111111112'), mint: { decimals: 9 } },
    tokenY: { publicKey: new PublicKey('11111111111111111111111111111113'), mint: { decimals: 6 } },
    lbPair: { binStep: 20, activeId: 0 },
    getActiveBin: jest.fn().mockResolvedValue({ binId: 0, pricePerToken: '1' }),
    toPricePerLamport: jest.fn((p: number) => String(p)),
    getBinIdFromPrice: jest.fn((p: number) => (p <= 1 ? minBinId : maxBinId)),
    initializePositionAndAddLiquidityByStrategy: jest.fn().mockResolvedValue({ instructions: [ix()], add: jest.fn() }),
    initializeMultiplePositionAndAddLiquidityByStrategy: jest.fn(async (gen: (n: number) => Promise<Keypair[]>) => ({
      instructionsByPositions: (await gen(1)).map((positionKeypair) => ({
        positionKeypair,
        initializePositionIx: ix(),
        initializeAtaIxs: [ix()],
        addLiquidityIxs: [[ix()], [ix()]],
      })),
    })),
  };
};

const primeSolana = () => {
  let sent = 0;
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    connection: { getBalance: jest.fn().mockResolvedValue(57_500_000) },
    getToken: jest.fn(async (address: string) => ({ symbol: address.endsWith('2') ? 'TKX' : 'TKY', address })),
    sendAndConfirmTransactionForWallet: jest.fn(async () => ({ signature: `sig${sent++}`, fee: 0.000005 })),
    getConfirmedTransactionData: jest.fn().mockResolvedValue({
      transaction: { message: { getAccountKeys: () => ({ staticAccountKeys: [] }) } },
      meta: { postBalances: [] },
    }),
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
      balanceChanges: [-1, -2],
      fee: 0.000005,
      txDetails: {},
    }),
  });
};

describe('meteora openPosition slippage units', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes slippage to the single-transaction builder as a percentage, not basis points', async () => {
    const pool = buildPool(10);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    primeSolana();

    await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2, 2);

    // 2, not 200. 200 is clamped to 100 by the SDK, which removes the deposit ceiling.
    expect(pool.initializePositionAndAddLiquidityByStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ slippage: 2 }),
    );
  });

  it('never hands the SDK a value the clamp would turn into an unbounded deposit', async () => {
    const pool = buildPool(10);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    primeSolana();

    await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2, 1);

    const { slippage } = pool.initializePositionAndAddLiquidityByStrategy.mock.calls[0][0];
    expect(slippage).toBe(1);
    expect(slippage).toBeLessThan(100);
  });

  it('agrees with the chunked path on the unit', async () => {
    const narrow = buildPool(10);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(narrow) });
    primeSolana();
    await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2, 2);

    const wide = buildPool(200);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(wide) });
    primeSolana();
    await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2, 2);

    const narrowSlippage = narrow.initializePositionAndAddLiquidityByStrategy.mock.calls[0][0].slippage;
    // slippagePercentage is the 7th positional argument of the chunked builder.
    const wideSlippage = (wide.initializeMultiplePositionAndAddLiquidityByStrategy.mock.calls[0] as unknown[])[6];

    expect(narrowSlippage).toBe(wideSlippage);
  });

  it('omits slippage entirely when it is zero, rather than sending 0', async () => {
    const pool = buildPool(10);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    primeSolana();

    await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2, 0);

    expect(pool.initializePositionAndAddLiquidityByStrategy).toHaveBeenCalledWith(
      expect.not.objectContaining({ slippage: expect.anything() }),
    );
  });
});

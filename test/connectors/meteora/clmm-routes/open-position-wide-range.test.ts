import { Keypair, PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { openPosition } from '../../../../src/connectors/meteora/clmm-routes/openPosition';
import { Meteora } from '../../../../src/connectors/meteora/meteora';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');

// A DLMM position's bin range is bounded by what one transaction can create and fund, not
// by what the program allows: POSITION_MAX_LENGTH is 1400 bins, while the one-shot
// create-and-fund path tops out around DEFAULT_BIN_PER_POSITION. A range wider than that is
// therefore still ONE position — it is the deposit that has to be chunked across several
// transactions — so the route sends the chunks rather than rejecting the range.
//
// Pinned here:
//   - narrow range  -> one transaction, unchanged behaviour.
//   - wide range    -> one position, several transactions, amounts summed over all of them.
//   - a failed chunk -> an error naming the position that was already created.

const POOL = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6';
const WALLET = 'DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9';
const SIGS = ['sigCreate', 'sigChunk1', 'sigChunk2'];

const ix = () =>
  new TransactionInstruction({
    keys: [],
    programId: SystemProgram.programId,
    data: Buffer.alloc(0),
  });

/** Bin ids for a range `width` bins wide, straddling the active bin. */
const rangeFor = (width: number) => ({ minBinId: 0, maxBinId: width - 1 });

const buildPool = (width: number, chunkCount: number, positionCount = 1) => {
  const { minBinId, maxBinId } = rangeFor(width);
  return {
    tokenX: { publicKey: new PublicKey('11111111111111111111111111111112'), mint: { decimals: 9 } },
    tokenY: { publicKey: new PublicKey('11111111111111111111111111111113'), mint: { decimals: 6 } },
    lbPair: { binStep: 20, activeId: 0 },
    getActiveBin: jest.fn().mockResolvedValue({ binId: 0, pricePerToken: '1' }),
    toPricePerLamport: jest.fn((p: number) => String(p)),
    getBinIdFromPrice: jest.fn((p: number) => (p <= 1 ? minBinId : maxBinId)),
    initializePositionAndAddLiquidityByStrategy: jest.fn().mockResolvedValue({ instructions: [ix()], add: jest.fn() }),
    initializeMultiplePositionAndAddLiquidityByStrategy: jest.fn(async (gen: (n: number) => Promise<Keypair[]>) => ({
      instructionsByPositions: (await gen(positionCount)).map((positionKeypair) => ({
        positionKeypair,
        initializePositionIx: ix(),
        initializeAtaIxs: [ix()],
        addLiquidityIxs: Array.from({ length: chunkCount }, () => [ix()]),
      })),
    })),
  };
};

const primeSolana = (opts: { failChunk?: number } = {}) => {
  let sent = 0;
  const sendAndConfirmTransactionForWallet = jest.fn(async () => {
    const i = sent++;
    if (opts.failChunk !== undefined && i === opts.failChunk) {
      throw new Error('blockhash expired');
    }
    return { signature: SIGS[i] ?? `sig${i}`, fee: 0.000005 };
  });

  (Solana.getInstance as jest.Mock).mockResolvedValue({
    connection: { getBalance: jest.fn().mockResolvedValue(57_500_000) },
    getToken: jest.fn(async (address: string) => ({ symbol: address.endsWith('2') ? 'TKX' : 'TKY', address })),
    sendAndConfirmTransactionForWallet,
    getConfirmedTransactionData: jest.fn().mockResolvedValue({
      transaction: { message: { getAccountKeys: () => ({ staticAccountKeys: [] }) } },
      meta: { postBalances: [] },
    }),
    // Each transaction moves a slice of the liquidity.
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
      balanceChanges: [-1, -2],
      fee: 0.000005,
      txDetails: {},
    }),
  });
  return sendAndConfirmTransactionForWallet;
};

describe('meteora openPosition across a wide bin range', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens a narrow range in a single transaction', async () => {
    const pool = buildPool(10, 1);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    const send = primeSolana();

    const result = await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2);

    expect(send).toHaveBeenCalledTimes(1);
    expect(pool.initializePositionAndAddLiquidityByStrategy).toHaveBeenCalled();
    expect(pool.initializeMultiplePositionAndAddLiquidityByStrategy).not.toHaveBeenCalled();
    expect(result.status).toBe(1);
  });

  it('covers a range wider than one transaction with one position and several transactions', async () => {
    // 200 bins: too wide to create and fund at once, but well inside POSITION_MAX_LENGTH.
    const pool = buildPool(200, 2);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    const send = primeSolana();

    const result = await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2);

    // One create + one per deposit chunk, and no fallback to the single-transaction builder.
    expect(send).toHaveBeenCalledTimes(3);
    expect(pool.initializePositionAndAddLiquidityByStrategy).not.toHaveBeenCalled();
    expect(result.status).toBe(1);

    // Still a single position, despite the extra transactions.
    expect(typeof result.data?.positionAddress).toBe('string');

    // Amounts are summed over every transaction that funded it. Reading only the first
    // would report a third of what was added.
    expect(result.data?.baseTokenAmountAdded).toBeCloseTo(3, 9);
    expect(result.data?.quoteTokenAmountAdded).toBeCloseTo(6, 9);

    // Fee is the total across the transactions, not one of them.
    expect(result.data?.fee).toBeCloseTo(0.000015, 9);
  });

  it('reads rent from the position account, which a chunked open grows as it funds', async () => {
    const pool = buildPool(200, 2);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    primeSolana();

    const result = await openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2);

    // 57,500,000 lamports from the account, not the 0 the creating transaction would show.
    expect(result.data?.positionRent).toBeCloseTo(0.0575, 9);
  });

  it('names the created position when a later chunk fails', async () => {
    const pool = buildPool(200, 2);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    primeSolana({ failChunk: 2 }); // create + chunk 1 land, chunk 2 fails

    // The position exists and holds what landed; the caller must be told so it can be
    // funded or closed rather than silently orphaned.
    await expect(openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2)).rejects.toThrow(
      /was opened, but only 1 of 2 liquidity chunks were funded/,
    );
  });

  it('refuses a range that needs more positions than the response can describe', async () => {
    // Above POSITION_MAX_LENGTH the SDK splits into several positions.
    const pool = buildPool(2000, 1, 2);
    (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(pool) });
    primeSolana();

    await expect(openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2)).rejects.toThrow(/needs 2 separate positions/);
  });
});

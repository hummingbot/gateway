import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { captureUnsignedTransaction } from '../../../../src/chains/solana/solana-build-mode';
import { openPosition } from '../../../../src/connectors/meteora/clmm-routes/openPosition';
import { Meteora } from '../../../../src/connectors/meteora/meteora';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');

// Build mode returns ONE unsigned transaction for an external signer to sign. A chunked
// open cannot be expressed that way: the capture fires on the first transaction — creating
// the position — and the deposit chunks never run. Left unguarded, a build-mode caller gets
// a perfectly valid transaction that opens an EMPTY position, signs it, and sees no error.
//
// It cannot be resumed the way build-close is either ("submit it and call build again"),
// because each call mints a fresh position keypair, so calling again opens a second empty
// position rather than funding the first. Hence: refuse, rather than silently under-deliver.

const POOL = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6';
const WALLET = 'DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9';

const primePool = (width: number) => {
  const minBinId = 0;
  const maxBinId = width - 1;
  const dlmmPool = {
    tokenX: { publicKey: new PublicKey('11111111111111111111111111111112'), mint: { decimals: 9 } },
    tokenY: { publicKey: new PublicKey('11111111111111111111111111111113'), mint: { decimals: 6 } },
    lbPair: { binStep: 20, activeId: 0 },
    getActiveBin: jest.fn().mockResolvedValue({ binId: 0, pricePerToken: '1' }),
    toPricePerLamport: jest.fn((p: number) => String(p)),
    getBinIdFromPrice: jest.fn((p: number) => (p <= 1 ? minBinId : maxBinId)),
    initializePositionAndAddLiquidityByStrategy: jest.fn().mockResolvedValue({ instructions: [], feePayer: null }),
    initializeMultiplePositionAndAddLiquidityByStrategy: jest.fn(),
  };
  (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(dlmmPool) });
  (Solana.getInstance as jest.Mock).mockResolvedValue({
    connection: { getBalance: jest.fn().mockResolvedValue(0) },
    getToken: jest.fn(async (address: string) => ({ symbol: 'TK', address })),
    sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig', fee: 0 }),
    getConfirmedTransactionData: jest.fn().mockResolvedValue(null),
    extractBalanceChangesAndFee: jest.fn(),
  });
  return dlmmPool;
};

describe('meteora openPosition in build mode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses a range that cannot be funded in one transaction', async () => {
    const pool = primePool(200);

    await expect(
      captureUnsignedTransaction({}, () => openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2)),
    ).rejects.toThrow(/several transactions, and a build returns a single unsigned transaction/);

    // Refused before anything was built, so no empty position can be handed back.
    expect(pool.initializeMultiplePositionAndAddLiquidityByStrategy).not.toHaveBeenCalled();
  });

  it('still builds a range that fits in one transaction', async () => {
    const pool = primePool(Meteora.MAX_POSITION_BIN_WIDTH);

    await captureUnsignedTransaction({}, () => openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2)).catch(
      () => undefined,
    );

    // The narrow path is untouched by the guard: it reaches the single-transaction builder.
    expect(pool.initializePositionAndAddLiquidityByStrategy).toHaveBeenCalled();
  });
});

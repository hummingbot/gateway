import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { captureUnsignedTransaction } from '../../../../src/chains/solana/solana-build-mode';
import { openPosition } from '../../../../src/connectors/meteora/clmm-routes/openPosition';
import { Meteora } from '../../../../src/connectors/meteora/meteora';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');

// A range wider than one transaction can fund is opened over several: the position's
// creation, then each deposit chunk. It cannot be resumed by calling build again (each call
// mints a fresh position keypair, so a second call opens a second, empty position), so build
// mode answers all of them at once through captureSequenceForExternalSigner.

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
  const solana = {
    connection: { getBalance: jest.fn().mockResolvedValue(0) },
    getToken: jest.fn(async (address: string) => ({ symbol: 'TK', address })),
    sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig', fee: 0 }),
    getConfirmedTransactionData: jest.fn().mockResolvedValue(null),
    extractBalanceChangesAndFee: jest.fn(),
    captureSequenceForExternalSigner: jest.fn().mockRejectedValue(new Error('captured')),
  };
  (Meteora.getInstance as jest.Mock).mockResolvedValue({ getDlmmPool: jest.fn().mockResolvedValue(dlmmPool) });
  (Solana.getInstance as jest.Mock).mockResolvedValue(solana);
  return { pool: dlmmPool, solana };
};

describe('meteora openPosition in build mode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('answers a wide range as the position creation followed by every deposit chunk', async () => {
    const { pool, solana } = primePool(200);
    const position = Keypair.generate();
    const ix = () =>
      SystemProgram.transfer({ fromPubkey: new PublicKey(WALLET), toPubkey: new PublicKey(WALLET), lamports: 0 });
    pool.initializeMultiplePositionAndAddLiquidityByStrategy.mockResolvedValue({
      instructionsByPositions: [
        {
          positionKeypair: position,
          initializeAtaIxs: [ix()],
          initializePositionIx: ix(),
          addLiquidityIxs: [[ix()], [ix()]],
        },
      ],
    });

    await expect(
      captureUnsignedTransaction({}, () => openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2)),
    ).rejects.toThrow('captured');

    const [steps, wallet] = solana.captureSequenceForExternalSigner.mock.calls[0];
    expect(wallet).toBe(WALLET);
    expect(steps).toHaveLength(3);
    expect(steps[0].signers).toEqual([position]);
    expect((steps[0].transaction as Transaction).instructions).toHaveLength(2);
    expect(steps.slice(1).map((s: { signers?: Keypair[] }) => s.signers)).toEqual([undefined, undefined]);
    // Nothing is sent.
    expect(solana.sendAndConfirmTransactionForWallet).not.toHaveBeenCalled();
  });

  it('still builds a range that fits in one transaction', async () => {
    const { pool, solana } = primePool(Meteora.MAX_POSITION_BIN_WIDTH);

    await captureUnsignedTransaction({}, () => openPosition('mainnet-beta', WALLET, 1, 2, POOL, 1, 2)).catch(
      () => undefined,
    );

    // The narrow path is untouched by the guard: it reaches the single-transaction builder.
    expect(pool.initializePositionAndAddLiquidityByStrategy).toHaveBeenCalled();
    expect(solana.captureSequenceForExternalSigner).not.toHaveBeenCalled();
  });
});

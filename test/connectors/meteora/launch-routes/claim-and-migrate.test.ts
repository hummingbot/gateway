import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';

import { captureUnsignedTransaction } from '../../../../src/chains/solana/solana-build-mode';
import { MeteoraDbc } from '../../../../src/connectors/meteora/meteora-dbc';

jest.mock('../../../../src/connectors/meteora/meteora-dbc');

const CREATOR = new PublicKey('82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5');
const PARTNER = new PublicKey('DQcmxgGCEwThGCzV6NmFG2WsbUpch3HLoZAhctcgeRM9');
const STRANGER = new PublicKey('SysvarC1ock11111111111111111111111111111111');
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const POOL = new PublicKey('SysvarRent111111111111111111111111111111111');
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');

const ix = (tag: number) => new TransactionInstruction({ programId: POOL, keys: [], data: Buffer.from([tag]) });
const txOf = (...tags: number[]) => new Transaction().add(...tags.map(ix));

const client = {
  creator: { claimCreatorTradingFee: jest.fn(async () => txOf(1)) },
  partner: { claimPartnerTradingFee: jest.fn(async () => txOf(2)) },
  migration: {
    createLocker: jest.fn(async () => txOf(3)),
    migrateToDammV2: jest.fn(async () => ({
      transaction: txOf(4),
      firstPositionNftKeypair: { publicKey: STRANGER },
      secondPositionNftKeypair: { publicKey: POOL },
    })),
  },
};
const solana = {
  sendAndConfirmTransactionForWallet: jest.fn(async () => ({ signature: 'sig', fee: 0 })),
  getConfirmedTransactionData: jest.fn(async () => ({ meta: { fee: 5000 } })),
  captureSequenceForExternalSigner: jest.fn(async () => {
    throw new Error('captured');
  }),
};

const prime = (poolState: Record<string, unknown>, config: Record<string, unknown> = {}) => {
  (MeteoraDbc.getInstance as jest.Mock).mockResolvedValue({
    client,
    solana,
    getPoolByBaseMint: jest.fn(async () => ({
      poolAddress: POOL,
      configAddress: POOL,
      pool: {
        poolState: {
          creator: CREATOR,
          baseMint: new PublicKey(MINT),
          creatorBaseFee: new BN(0),
          creatorQuoteFee: new BN(0),
          partnerBaseFee: new BN(0),
          partnerQuoteFee: new BN(0),
          quoteReserve: new BN(10),
          migrationProgress: 1,
          ...poolState,
        },
      },
      config: {
        feeClaimer: PARTNER,
        quoteMint: WSOL,
        migrationOption: 1,
        migrationFeeOption: 0,
        migrationQuoteThreshold: new BN(100),
        lockedVestingConfig: { amountPerPeriod: new BN(0), cliffUnlockAmount: new BN(0) },
        ...config,
      },
      quoteMint: WSOL,
      quoteDecimals: 9,
      isMigrated: false,
    })),
  });
};

beforeEach(() => jest.clearAllMocks());

describe('meteora DBC claimCreatorFees', () => {
  const claim = async (wallet: PublicKey) =>
    (await import('../../../../src/connectors/meteora/launch-routes/claimCreatorFees')).claimCreatorFees(
      'mainnet-beta',
      wallet.toBase58(),
      MINT,
    );

  it("claims the creator's share, and reports it in the quote token", async () => {
    prime({ creatorQuoteFee: new BN(2_500_000_000) });
    const result = await claim(CREATOR);
    expect(client.creator.claimCreatorTradingFee).toHaveBeenCalled();
    expect(client.partner.claimPartnerTradingFee).not.toHaveBeenCalled();
    expect(result).toEqual({ signature: 'sig', status: 1, claimed: 2.5, quoteMint: WSOL.toBase58(), fee: 0.000005 });
  });

  it("claims the partner's share when the wallet is the config's fee claimer", async () => {
    prime({ partnerQuoteFee: new BN(1) });
    await claim(PARTNER);
    expect(client.partner.claimPartnerTradingFee).toHaveBeenCalled();
    expect(client.creator.claimCreatorTradingFee).not.toHaveBeenCalled();
  });

  it('refuses a wallet that is neither, and a wallet owed nothing', async () => {
    prime({ creatorQuoteFee: new BN(1) });
    await expect(claim(STRANGER)).rejects.toThrow('is neither the creator');
    prime({});
    await expect(claim(CREATOR)).rejects.toThrow('No Meteora DBC trading fees to claim');
  });
});

describe('meteora DBC migrateCurve', () => {
  const migrate = async () =>
    (await import('../../../../src/connectors/meteora/launch-routes/migrate')).migrateCurve(
      'mainnet-beta',
      CREATOR.toBase58(),
      MINT,
    );

  it('builds the locker first when the config locks vesting and it is not made yet', async () => {
    prime({}, { lockedVestingConfig: { amountPerPeriod: new BN(1), cliffUnlockAmount: new BN(0) } });
    await expect(captureUnsignedTransaction({}, migrate)).rejects.toThrow('captured');
    const [steps] = solana.captureSequenceForExternalSigner.mock.calls[0] as unknown as [
      { transaction: Transaction; signers?: unknown[] }[],
    ];
    expect(steps.map((s) => s.transaction.instructions[0].data[0])).toEqual([3, 4]);
    expect(steps[1].signers).toHaveLength(2);
    expect(solana.sendAndConfirmTransactionForWallet).not.toHaveBeenCalled();
  });

  it('migrates alone once the locker exists, or when nothing vests', async () => {
    prime(
      { migrationProgress: 2 },
      { lockedVestingConfig: { amountPerPeriod: new BN(1), cliffUnlockAmount: new BN(0) } },
    );
    await expect(captureUnsignedTransaction({}, migrate)).rejects.toThrow('captured');
    const [steps] = solana.captureSequenceForExternalSigner.mock.calls[0] as unknown as [unknown[]];
    expect(steps).toHaveLength(1);
    expect(client.migration.createLocker).not.toHaveBeenCalled();
  });

  it('refuses a curve that is not complete, and a DAMM v1 config', async () => {
    prime({ migrationProgress: 0 });
    await expect(migrate()).rejects.toThrow('is not complete');
    prime({}, { migrationOption: 0 });
    await expect(migrate()).rejects.toThrow('migrates to DAMM v1');
  });
});

/**
 * Unit tests for /chains/solana/build-transaction: caller-supplied instructions go
 * through the SAME capture pipeline the /trading build-* routes use (an empty
 * transaction plus the instructions as build-context extras), so this asserts the
 * generic route inherits the whole contract — simulation, compute budget, fresh
 * blockhash, wallet-only-signer rule, empty fee-payer slot.
 */
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

import { buildSolanaTransaction } from '../../../../src/chains/solana/routes/build-transaction';
import { Solana } from '../../../../src/chains/solana/solana';

const FRESH_BLOCKHASH = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi5';
const EXTRA_PROGRAM = 'FBS3nK2z8JPaVokhKefCiWs1Ub18U1YceY2ryNFSEcyW';

const wallet = Keypair.generate();
const walletAddress = wallet.publicKey.toBase58();

/** A fake Solana instance carrying the real prototype methods of the capture path. */
const fakeSolana = () => ({
  sendAndConfirmTransactionForWallet: (Solana.prototype as any).sendAndConfirmTransactionForWallet,
  captureForExternalSigner: (Solana.prototype as any).captureForExternalSigner,
  collectAppliedSignatures: (Solana.prototype as any).collectAppliedSignatures,
  simulateWithErrorHandling: jest.fn(),
  estimateGasPrice: jest.fn(async () => 0.00001),
  config: { defaultComputeUnits: 200000 },
  prepareWallet: jest.fn(async () => {
    throw new Error('prepareWallet must not be called in build mode');
  }),
  _sendAndConfirmRawTransaction: jest.fn(async () => {
    throw new Error('must not broadcast in build mode');
  }),
  connection: {
    simulateTransaction: jest.fn(async () => ({ value: { err: null, unitsConsumed: 50000 } })),
    getLatestBlockhash: jest.fn(async () => ({ blockhash: FRESH_BLOCKHASH, lastValidBlockHeight: 424242 })),
    getLatestBlockhashAndContext: jest.fn(async () => ({
      value: { lastValidBlockHeight: 424242, blockhash: FRESH_BLOCKHASH },
    })),
    getBlockHeight: jest.fn(async () => 424100),
  },
});

const walletOnlyInstruction = {
  programId: EXTRA_PROGRAM,
  accounts: [{ pubkey: walletAddress, isSigner: true, isWritable: true }],
  data: Buffer.from([9, 9, 9]).toString('base64'),
};

describe('buildSolanaTransaction', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds an unsigned transaction from the given instructions with the full prep pipeline', async () => {
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(fakeSolana() as any);

    const built = await buildSolanaTransaction({} as any, 'mainnet-beta', walletAddress, [walletOnlyInstruction]);

    expect(built.feePayer).toBe(walletAddress);
    expect(built.recentBlockhash).toBe(FRESH_BLOCKHASH);
    expect(built.lastValidBlockHeight).toBe(424242);
    expect(built.currentBlockHeight).toBe(424100);
    expect(built.extraSigners).toEqual([]); // no ephemeral keypairs on this path

    const tx = Transaction.from(Buffer.from(built.transaction, 'base64'));
    expect(tx.feePayer!.toBase58()).toBe(walletAddress);
    const programIds = tx.instructions.map((ix) => ix.programId.toBase58());
    expect(programIds).toContain(EXTRA_PROGRAM);
    // Gateway added its compute budget around the caller's instruction.
    expect(programIds.filter((id) => id.startsWith('ComputeBudget'))).toHaveLength(2);
    // Only the wallet's (empty) signature slot remains.
    expect(tx.signatures.map((s) => s.publicKey.toBase58())).toEqual([walletAddress]);
    expect(tx.signatures[0].signature).toBeNull();
  });

  it('enforces the wallet-only-signer rule on the instructions', async () => {
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(fakeSolana() as any);
    const stranger = Keypair.generate().publicKey.toBase58();

    await expect(
      buildSolanaTransaction({} as any, 'mainnet-beta', walletAddress, [
        { ...walletOnlyInstruction, accounts: [{ pubkey: stranger, isSigner: true, isWritable: false }] },
      ]),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/not the wallet/) });
  });

  it('surfaces a simulation failure instead of returning an unsignable transaction', async () => {
    const fake = fakeSolana();
    fake.simulateWithErrorHandling.mockRejectedValue(
      Object.assign(new Error('Transaction simulation failed'), { statusCode: 400 }),
    );
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(fake as any);

    await expect(
      buildSolanaTransaction({} as any, 'mainnet-beta', walletAddress, [walletOnlyInstruction]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an invalid wallet address as a 400', async () => {
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(fakeSolana() as any);

    await expect(
      buildSolanaTransaction({} as any, 'mainnet-beta', 'not-an-address', [walletOnlyInstruction]),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Invalid Solana address/) });
  });

  it('a transfer-style instruction round-trips byte-exact', async () => {
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(fakeSolana() as any);
    const transfer = SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 12345,
    });
    const wire = {
      programId: transfer.programId.toBase58(),
      accounts: transfer.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: transfer.data.toString('base64'),
    };

    const built = await buildSolanaTransaction({} as any, 'mainnet-beta', walletAddress, [wire]);
    const tx = Transaction.from(Buffer.from(built.transaction, 'base64'));
    const rebuilt = tx.instructions.find((ix) => ix.programId.equals(SystemProgram.programId));
    expect(rebuilt).toBeDefined();
    expect(rebuilt!.data.toString('base64')).toBe(wire.data);
    expect(rebuilt!.keys.map((k) => k.pubkey.toBase58())).toEqual(transfer.keys.map((k) => k.pubkey.toBase58()));
  });
});

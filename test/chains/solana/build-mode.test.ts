/**
 * Unit tests for build mode (stateless signing, #682): the chokepoint's
 * captureForExternalSigner branch and the captureUnsignedTransaction wrapper.
 *
 * Same technique as sendAndConfirmTransactionForWallet.test.ts: prototype methods are
 * exercised via .call against a hand-built `this`, so the branching is tested without
 * the Solana singleton or RPC. prepareWallet is stubbed to THROW, proving build mode
 * never touches wallet storage.
 */
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { Solana } from '../../../src/chains/solana/solana';
import {
  captureUnsignedTransaction,
  MEMO_PROGRAM_ID,
  parseReferences,
} from '../../../src/chains/solana/solana-build-mode';

const STALE_BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
const FRESH_BLOCKHASH = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi5';
const EXTRA_PROGRAM = 'FBS3nK2z8JPaVokhKefCiWs1Ub18U1YceY2ryNFSEcyW';

const chokepoint = (Solana.prototype as any).sendAndConfirmTransactionForWallet as (
  this: unknown,
  tx: Transaction | VersionedTransaction,
  address: string,
  extraSigners?: Keypair[],
  priorityFeePerCU?: number,
) => Promise<{ signature: string; fee: number }>;

const fakeSolana = () => ({
  captureSequenceForExternalSigner: (Solana.prototype as any).captureSequenceForExternalSigner,
  captureForExternalSigner: (Solana.prototype as any).captureForExternalSigner,
  collectAppliedSignatures: (Solana.prototype as any).collectAppliedSignatures,
  instructionsOf: (Solana.prototype as any).instructionsOf,
  prepareVersionedTx: (Solana.prototype as any).prepareVersionedTx,
  simulateWithErrorHandling: jest.fn(),
  estimateGasPrice: jest.fn(async () => 0.00001),
  config: { defaultComputeUnits: 200000 },
  // Build mode must never resolve a wallet — there is none to resolve.
  prepareWallet: jest.fn(async () => {
    throw new Error('prepareWallet must not be called in build mode');
  }),
  _sendAndConfirmRawTransaction: jest.fn(async () => {
    throw new Error('must not broadcast in build mode');
  }),
  connection: {
    simulateTransaction: jest.fn(async () => ({ value: { err: null, unitsConsumed: 100000 } })),
    getLatestBlockhashAndContext: jest.fn(async () => ({
      value: { lastValidBlockHeight: 424242, blockhash: FRESH_BLOCKHASH },
    })),
    getBlockHeight: jest.fn(async () => 424100),
  },
});

/** A legacy tx like a connector hands the chokepoint: ephemeral account creation, no fee payer. */
function legacyTx(wallet: PublicKey, ephemeral: PublicKey): Transaction {
  const tx = new Transaction();
  tx.recentBlockhash = STALE_BLOCKHASH;
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: wallet,
      newAccountPubkey: ephemeral,
      lamports: 1,
      space: 82,
      programId: SystemProgram.programId,
    }),
  );
  return tx;
}

function versionedTx(wallet: PublicKey, ephemeral: PublicKey): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: wallet,
    recentBlockhash: STALE_BLOCKHASH,
    instructions: [
      SystemProgram.createAccount({
        fromPubkey: wallet,
        newAccountPubkey: ephemeral,
        lamports: 1,
        space: 82,
        programId: SystemProgram.programId,
      }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

const extraInstruction = (signerPubkey?: string) => ({
  programId: EXTRA_PROGRAM,
  accounts: signerPubkey ? [{ pubkey: signerPubkey, isSigner: true, isWritable: false }] : [],
  data: Buffer.from([1, 2, 3]).toString('base64'),
});

describe('build mode capture at the chokepoint', () => {
  const wallet = Keypair.generate();
  const walletAddress = wallet.publicKey.toBase58();

  it('captures a legacy tx: fresh blockhash, compute budget, extra ix, ephemeral partial-signature', async () => {
    const fake = fakeSolana();
    const ephemeral = Keypair.generate();

    const built = await captureUnsignedTransaction({ extraInstructions: [extraInstruction(walletAddress)] }, () =>
      chokepoint.call(fake, legacyTx(wallet.publicKey, ephemeral.publicKey), walletAddress, [ephemeral]),
    );

    expect(built.feePayer).toBe(walletAddress);
    expect(built.recentBlockhash).toBe(FRESH_BLOCKHASH);
    expect(built.lastValidBlockHeight).toBe(424242);
    expect(built.currentBlockHeight).toBe(424100);

    const tx = Transaction.from(Buffer.from(built.transaction!, 'base64'));
    expect(tx.recentBlockhash).toBe(FRESH_BLOCKHASH);
    expect(tx.feePayer!.toBase58()).toBe(walletAddress);
    // The operation's instruction, the caller's extra instruction, and Gateway's compute budget.
    const programIds = tx.instructions.map((ix) => ix.programId.toBase58());
    expect(programIds).toContain(SystemProgram.programId.toBase58());
    expect(programIds).toContain(EXTRA_PROGRAM);
    expect(programIds.filter((id) => id.startsWith('ComputeBudget'))).toHaveLength(2);

    // Ephemeral signed; the wallet (fee payer) slot is open for the external signer.
    const signed = tx.signatures.filter((s) => s.signature !== null).map((s) => s.publicKey.toBase58());
    expect(signed).toEqual([ephemeral.publicKey.toBase58()]);
    expect(built.extraSigners).toHaveLength(1);
    expect(built.extraSigners[0].pubkey).toBe(ephemeral.publicKey.toBase58());
    // The returned signature verifies over the exact serialized message.
    expect(
      nacl.sign.detached.verify(
        new Uint8Array(tx.serializeMessage()),
        new Uint8Array(Buffer.from(built.extraSigners[0].signature, 'base64')),
        ephemeral.publicKey.toBytes(),
      ),
    ).toBe(true);

    // Nothing was broadcast and no wallet was resolved.
    expect(fake._sendAndConfirmRawTransaction).not.toHaveBeenCalled();
    expect(fake.prepareWallet).not.toHaveBeenCalled();
  });

  it('captures a versioned tx with a refreshed blockhash and a valid ephemeral signature', async () => {
    const fake = fakeSolana();
    const ephemeral = Keypair.generate();

    const built = await captureUnsignedTransaction({}, () =>
      chokepoint.call(fake, versionedTx(wallet.publicKey, ephemeral.publicKey), walletAddress, [ephemeral]),
    );

    const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(built.transaction, 'base64')));
    expect(tx.message.recentBlockhash).toBe(FRESH_BLOCKHASH);
    expect(built.recentBlockhash).toBe(FRESH_BLOCKHASH);

    // Ephemeral signature is present and verifies over the FINAL message (compute budget included).
    expect(built.extraSigners).toEqual([{ pubkey: ephemeral.publicKey.toBase58(), signature: expect.any(String) }]);
    const required = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
    const ephemeralIndex = required.findIndex((k) => k.equals(ephemeral.publicKey));
    expect(ephemeralIndex).toBeGreaterThanOrEqual(0);
    expect(
      nacl.sign.detached.verify(
        new Uint8Array(tx.message.serialize()),
        tx.signatures[ephemeralIndex],
        ephemeral.publicKey.toBytes(),
      ),
    ).toBe(true);

    // The wallet's fee-payer slot is still empty (all zeros).
    const walletIndex = required.findIndex((k) => k.equals(wallet.publicKey));
    expect(tx.signatures[walletIndex].every((b) => b === 0)).toBe(true);
  });

  it('builds unsimulated with exactly the caller compute limit, for a tx that follows a prepare', async () => {
    const fake = fakeSolana();
    const ephemeral = Keypair.generate();

    const built = await captureUnsignedTransaction(
      {},
      () => chokepoint.call(fake, legacyTx(wallet.publicKey, ephemeral.publicKey), walletAddress, [ephemeral]),
      450_000,
      undefined,
      true,
    );

    expect(fake.simulateWithErrorHandling).not.toHaveBeenCalled();
    expect(fake.connection.simulateTransaction).not.toHaveBeenCalled();
    const tx = Transaction.from(Buffer.from(built.transaction!, 'base64'));
    const limit = tx.instructions.find(
      (ix) => ix.programId.toBase58().startsWith('ComputeBudget') && ix.data[0] === 2,
    )!;
    expect(limit.data.readUInt32LE(1)).toBe(450_000);
  });

  it('refuses an unsimulated build with no compute limit', async () => {
    await expect(captureUnsignedTransaction({}, async () => undefined, undefined, undefined, true)).rejects.toThrow(
      'An unsimulated build needs minComputeUnits for its compute limit',
    );
  });

  it('refreshes the blockhash BEFORE the pre-flight simulation (fork regression)', async () => {
    // An aggregator-built tx (jupiter et al.) arrives with a mainnet blockhash that the
    // capture path is about to discard. Simulating against it first fails on a forked
    // validator (BlockhashNotFound) for no reason — the pre-flight must run
    // against the blockhash that will actually be embedded.
    const fake = fakeSolana();
    const seenAtSimulate: string[] = [];
    fake.simulateWithErrorHandling.mockImplementation(async (tx: Transaction | VersionedTransaction) => {
      seenAtSimulate.push(tx instanceof VersionedTransaction ? tx.message.recentBlockhash : tx.recentBlockhash!);
    });

    await captureUnsignedTransaction({}, () =>
      chokepoint.call(fake, versionedTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );
    const legacyFake = fakeSolana();
    legacyFake.simulateWithErrorHandling.mockImplementation(async (tx: Transaction | VersionedTransaction) => {
      seenAtSimulate.push(tx instanceof VersionedTransaction ? tx.message.recentBlockhash : tx.recentBlockhash!);
    });
    await captureUnsignedTransaction({}, () =>
      chokepoint.call(legacyFake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );

    expect(seenAtSimulate).toEqual([FRESH_BLOCKHASH, FRESH_BLOCKHASH]);
  });

  it("inserts Gateway's platform instructions: prepend first, append after the caller's extras (legacy)", async () => {
    const fake = fakeSolana();
    const pre = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: wallet.publicKey, lamports: 1 });
    const post = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: wallet.publicKey, lamports: 2 });

    const built = await captureUnsignedTransaction(
      { extraInstructions: [extraInstruction(walletAddress)] },
      () => chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
      undefined,
      undefined,
      undefined,
      { prepend: [pre], append: [post] },
    );

    const tx = Transaction.from(Buffer.from(built.transaction!, 'base64'));
    const body = tx.instructions.filter((ix) => !ix.programId.toBase58().startsWith('ComputeBudget'));
    // prepend, the operation, the caller's extra, append.
    expect(body.map((ix) => ix.programId.toBase58())).toEqual([
      SystemProgram.programId.toBase58(),
      SystemProgram.programId.toBase58(),
      EXTRA_PROGRAM,
      SystemProgram.programId.toBase58(),
    ]);
    expect(body[0].data.toString('hex')).toBe(pre.data.toString('hex'));
    expect(body[3].data.toString('hex')).toBe(post.data.toString('hex'));
  });

  it("inserts Gateway's platform instructions into a versioned tx before the ephemeral signs", async () => {
    const fake = fakeSolana();
    const ephemeral = Keypair.generate();
    const pre = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: wallet.publicKey, lamports: 1 });
    const post = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: wallet.publicKey, lamports: 2 });

    const built = await captureUnsignedTransaction(
      {},
      () => chokepoint.call(fake, versionedTx(wallet.publicKey, ephemeral.publicKey), walletAddress, [ephemeral]),
      undefined,
      undefined,
      undefined,
      { prepend: [pre], append: [post] },
    );

    const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(built.transaction, 'base64')));
    const message = TransactionMessage.decompile(tx.message);
    const body = message.instructions.filter((ix) => !ix.programId.toBase58().startsWith('ComputeBudget'));
    expect(body).toHaveLength(3);
    expect(body[0].data.toString('hex')).toBe(pre.data.toString('hex'));
    expect(body[2].data.toString('hex')).toBe(post.data.toString('hex'));
    const required = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
    const i = required.findIndex((k) => k.equals(ephemeral.publicKey));
    expect(
      nacl.sign.detached.verify(
        new Uint8Array(tx.message.serialize()),
        tx.signatures[i],
        ephemeral.publicKey.toBytes(),
      ),
    ).toBe(true);
  });

  it('refuses a platform instruction that names a non-wallet signer', async () => {
    const fake = fakeSolana();
    const stranger = Keypair.generate().publicKey;
    const bad = new TransactionInstruction({
      programId: new PublicKey(EXTRA_PROGRAM),
      keys: [{ pubkey: stranger, isSigner: true, isWritable: false }],
      data: Buffer.alloc(0),
    });
    await expect(
      captureUnsignedTransaction(
        {},
        () => chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
        undefined,
        undefined,
        undefined,
        { prepend: [bad], append: [] },
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/not the wallet/) });
  });

  it('rejects an extra instruction that names a non-wallet signer', async () => {
    const fake = fakeSolana();
    const stranger = Keypair.generate().publicKey.toBase58();

    await expect(
      captureUnsignedTransaction({ extraInstructions: [extraInstruction(stranger)] }, () =>
        chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/not the wallet/) });
  });

  it('reports an operation that completes without building a transaction', async () => {
    await expect(captureUnsignedTransaction({}, async () => 'no tx involved')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/nothing to sign/),
    });
  });

  it('propagates connector errors unchanged', async () => {
    await expect(
      captureUnsignedTransaction({}, async () => {
        throw new Error('pool not found');
      }),
    ).rejects.toThrow('pool not found');
  });

  it('refuses to broadcast when a connector bypasses the chokepoint during a build', async () => {
    const rawSend = (Solana.prototype as any)._sendAndConfirmRawTransaction as (
      this: unknown,
      serializedTx: Buffer,
    ) => Promise<any>;

    await expect(captureUnsignedTransaction({}, () => rawSend.call({}, Buffer.alloc(0)))).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringMatching(/build request/),
    });
  });
});

describe('build shape: memo, fee payer, instructions format', () => {
  const wallet = Keypair.generate();
  const walletAddress = wallet.publicKey.toBase58();

  it('appends a signer-less memo to the transaction', async () => {
    const fake = fakeSolana();
    const built = await captureUnsignedTransaction({ memo: 'app:ref=M1nt' }, () =>
      chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );

    const tx = Transaction.from(Buffer.from(built.transaction!, 'base64'));
    const memo = tx.instructions.find((ix) => ix.programId.equals(MEMO_PROGRAM_ID));
    expect(memo).toBeDefined();
    expect(memo!.keys).toEqual([]);
    expect(Buffer.from(new Uint8Array(memo!.data)).toString('utf8')).toBe('app:ref=M1nt');
  });

  it('refuses a memo over 128 bytes before building anything', async () => {
    const run = jest.fn();
    await expect(captureUnsignedTransaction({ memo: 'x'.repeat(129) }, run)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('makes a named fee payer the payer of a legacy tx, the wallet still a signer', async () => {
    const fake = fakeSolana();
    const payer = Keypair.generate().publicKey.toBase58();
    const built = await captureUnsignedTransaction({ feePayer: payer }, () =>
      chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );

    expect(built.feePayer).toBe(payer);
    const tx = Transaction.from(Buffer.from(built.transaction!, 'base64'));
    expect(tx.feePayer!.toBase58()).toBe(payer);
    const signers = tx.compileMessage().accountKeys.slice(0, tx.compileMessage().header.numRequiredSignatures);
    expect(signers.map((k) => k.toBase58())).toEqual(expect.arrayContaining([payer, walletAddress]));
    // Neither outside signer is reported as an applied ephemeral signature.
    expect(built.extraSigners.map((s) => s.pubkey)).not.toContain(payer);
  });

  it('makes a named fee payer the payer of a versioned tx', async () => {
    const fake = fakeSolana();
    const payer = Keypair.generate().publicKey;
    const built = await captureUnsignedTransaction({ feePayer: payer.toBase58() }, () =>
      chokepoint.call(fake, versionedTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );

    const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(built.transaction!, 'base64')));
    expect(tx.message.staticAccountKeys[0].equals(payer)).toBe(true);
    const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
    expect(signers.some((k) => k.equals(wallet.publicKey))).toBe(true);
  });

  it('returns raw instructions, the compute budget as numbers and the ephemeral keys', async () => {
    const fake = fakeSolana();
    const ephemeral = Keypair.generate();
    const built = await captureUnsignedTransaction({ format: 'instructions', memo: 'app:ref=M1nt' }, () =>
      chokepoint.call(fake, legacyTx(wallet.publicKey, ephemeral.publicKey), walletAddress, [ephemeral]),
    );

    expect(built.transaction).toBeUndefined();
    expect(built.extraSigners).toEqual([]);
    const programs = built.instructions!.map((ix) => ix.programId);
    expect(programs).toEqual([SystemProgram.programId.toBase58(), MEMO_PROGRAM_ID.toBase58()]);
    expect(built.computeUnits).toBeGreaterThan(100000);
    expect(built.addressLookupTableAddresses).toEqual([]);
    expect(built.ephemeralSigners).toEqual([
      { pubkey: ephemeral.publicKey.toBase58(), secretKey: bs58.encode(new Uint8Array(ephemeral.secretKey)) },
    ]);

    // The instructions recompile, with the wallet as payer, into a message naming the same accounts.
    const recompiled = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: built.recentBlockhash,
      instructions: built.instructions!.map(
        (ix) =>
          new TransactionInstruction({
            programId: new PublicKey(ix.programId),
            keys: ix.accounts.map((a) => ({
              pubkey: new PublicKey(a.pubkey),
              isSigner: a.isSigner,
              isWritable: a.isWritable,
            })),
            data: Buffer.from(ix.data, 'base64'),
          }),
      ),
    }).compileToV0Message();
    expect(recompiled.staticAccountKeys.some((k) => k.equals(ephemeral.publicKey))).toBe(true);
  });
});

describe('build shape: Solana Pay references', () => {
  const wallet = Keypair.generate();
  const walletAddress = wallet.publicKey.toBase58();
  const refs = [Keypair.generate().publicKey, Keypair.generate().publicKey];

  /** The reference-carrying instruction: a 0-lamport System transfer, payer to payer, then the references. */
  const expectReferenceInstruction = (
    keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
    payer: PublicKey,
  ) => {
    expect(keys[0].pubkey.equals(payer) && keys[1].pubkey.equals(payer)).toBe(true);
    expect(keys.slice(2).map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])).toEqual(
      refs.map((r) => [r.toBase58(), false, false]),
    );
  };

  it('attaches each reference read-only and non-signer on a no-op transfer (legacy)', async () => {
    const fake = fakeSolana();
    const built = await captureUnsignedTransaction({ references: refs.map((r) => r.toBase58()) }, () =>
      chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );
    const tx = Transaction.from(Buffer.from(built.transaction!, 'base64'));
    const carrier = tx.instructions.find((ix) => ix.keys.some((k) => k.pubkey.equals(refs[0])))!;
    expect(carrier.programId.equals(SystemProgram.programId)).toBe(true);
    expect(carrier.data.readUInt32LE(0)).toBe(2); // System transfer
    expect(carrier.data.readBigUInt64LE(4)).toBe(0n); // of 0 lamports
    expectReferenceInstruction(carrier.keys, wallet.publicKey);
    // The references add no signature.
    const message = tx.compileMessage();
    const signers = message.accountKeys.slice(0, message.header.numRequiredSignatures);
    expect(signers.some((k) => refs.some((r) => r.equals(k)))).toBe(false);
  });

  it('puts the references on the separate fee payer when there is one', async () => {
    const fake = fakeSolana();
    const payer = Keypair.generate().publicKey;
    const built = await captureUnsignedTransaction(
      { feePayer: payer.toBase58(), references: refs.map((r) => r.toBase58()) },
      () => chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );
    const tx = Transaction.from(Buffer.from(built.transaction!, 'base64'));
    const carrier = tx.instructions.find((ix) => ix.keys.some((k) => k.pubkey.equals(refs[0])))!;
    expectReferenceInstruction(carrier.keys, payer);
  });

  it('keeps a versioned transaction on its lookup table, the references static', async () => {
    const fake = fakeSolana();
    const tabled = Keypair.generate().publicKey;
    const table = new AddressLookupTableAccount({
      key: Keypair.generate().publicKey,
      state: {
        deactivationSlot: BigInt('18446744073709551615'),
        lastExtendedSlot: 0,
        lastExtendedSlotStartIndex: 0,
        addresses: [tabled],
      },
    });
    (fake.connection as any).getAddressLookupTable = jest.fn(async () => ({ value: table }));
    const message = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: STALE_BLOCKHASH,
      instructions: [
        new TransactionInstruction({
          programId: new PublicKey(EXTRA_PROGRAM),
          keys: [{ pubkey: tabled, isSigner: false, isWritable: false }],
          data: Buffer.from([7]),
        }),
      ],
    }).compileToV0Message([table]);
    const built = await captureUnsignedTransaction({ references: refs.map((r) => r.toBase58()) }, () =>
      chokepoint.call(fake, new VersionedTransaction(message), walletAddress),
    );
    const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(built.transaction!, 'base64')));
    expect(tx.message.addressTableLookups.map((l) => l.accountKey.toBase58())).toEqual([table.key.toBase58()]);
    const statics = tx.message.staticAccountKeys.map((k) => k.toBase58());
    for (const r of refs) expect(statics).toContain(r.toBase58());
    // Read-only and not a signer: past the signed keys, in the read-only tail.
    const { numRequiredSignatures, numReadonlyUnsignedAccounts } = tx.message.header;
    for (const r of refs) {
      const i = statics.indexOf(r.toBase58());
      expect(i).toBeGreaterThanOrEqual(numRequiredSignatures);
      expect(i).toBeGreaterThanOrEqual(statics.length - numReadonlyUnsignedAccounts);
    }
  });

  it('returns the reference instruction among the raw instructions', async () => {
    const fake = fakeSolana();
    const built = await captureUnsignedTransaction(
      { format: 'instructions', references: refs.map((r) => r.toBase58()) },
      () => chokepoint.call(fake, legacyTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    );
    const carrier = built.instructions!.find((ix) => ix.accounts.some((a) => a.pubkey === refs[0].toBase58()))!;
    expect(carrier.programId).toBe(SystemProgram.programId.toBase58());
    expect(carrier.accounts.slice(2)).toEqual(
      refs.map((r) => ({ pubkey: r.toBase58(), isSigner: false, isWritable: false })),
    );
  });

  it('refuses more than three, a non-address, or a repeat, before building anything', () => {
    const one = () => Keypair.generate().publicKey.toBase58();
    expect(() => parseReferences([one(), one(), one(), one()])).toThrow(/at most 3/);
    expect(() => parseReferences(['not-an-address'])).toThrow(/not a Solana address/);
    const dup = one();
    expect(() => parseReferences([dup, dup])).toThrow(/repeats/);
    expect(parseReferences(undefined)).toEqual([]);
  });
});

describe('build mode: an operation of several transactions', () => {
  const wallet = Keypair.generate();
  const walletAddress = wallet.publicKey.toBase58();
  const sequence = (Solana.prototype as any).captureSequenceForExternalSigner as (
    this: unknown,
    steps: { transaction: Transaction; signers?: Keypair[]; computeUnits?: number }[],
    address: string,
  ) => Promise<never>;
  const limitOf = (built: { transaction?: string }) =>
    Transaction.from(Buffer.from(built.transaction!, 'base64'))
      .instructions.find((ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2)!
      .data.readUInt32LE(1);

  it('returns the first transaction simulated and the rest in order, each with its own ephemeral signers', async () => {
    const fake = fakeSolana();
    const first = Keypair.generate();
    const second = Keypair.generate();
    const third = Keypair.generate();
    const withLimit = legacyTx(wallet.publicKey, third.publicKey);
    withLimit.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));

    const built = await captureUnsignedTransaction({ memo: 'app:ref=1' }, () =>
      sequence.call(
        fake,
        [
          { transaction: legacyTx(wallet.publicKey, first.publicKey), signers: [first] },
          { transaction: legacyTx(wallet.publicKey, second.publicKey), signers: [second], computeUnits: 300_000 },
          { transaction: withLimit, signers: [third] },
        ],
        walletAddress,
      ),
    );

    // Only the first is simulated; the others run against state it creates.
    expect(fake.simulateWithErrorHandling).toHaveBeenCalledTimes(1);
    expect(built.extraSigners.map((s) => s.pubkey)).toEqual([first.publicKey.toBase58()]);
    expect(built.followingTransactions!.map((b) => b.extraSigners.map((s) => s.pubkey))).toEqual([
      [second.publicKey.toBase58()],
      [third.publicKey.toBase58()],
    ]);
    expect(built.followingTransactions!.map(limitOf)).toEqual([300_000, 1_400_000]);
    // The caller's memo goes on the first transaction alone.
    const programs = (b: { transaction?: string }) =>
      Transaction.from(Buffer.from(b.transaction!, 'base64')).instructions.map((ix) => ix.programId.toBase58());
    expect(programs(built)).toContain(MEMO_PROGRAM_ID.toBase58());
    expect(programs(built.followingTransactions![0])).not.toContain(MEMO_PROGRAM_ID.toBase58());
  });

  it('answers one transaction exactly as a single build does', async () => {
    const fake = fakeSolana();
    const ephemeral = Keypair.generate();
    const built = await captureUnsignedTransaction({}, () =>
      sequence.call(
        fake,
        [{ transaction: legacyTx(wallet.publicKey, ephemeral.publicKey), signers: [ephemeral] }],
        walletAddress,
      ),
    );
    expect(built.followingTransactions).toBeUndefined();
  });

  it('refuses a following transaction with no compute limit', async () => {
    const fake = fakeSolana();
    await expect(
      captureUnsignedTransaction({}, () =>
        sequence.call(
          fake,
          [
            { transaction: legacyTx(wallet.publicKey, Keypair.generate().publicKey) },
            { transaction: legacyTx(wallet.publicKey, Keypair.generate().publicKey) },
          ],
          walletAddress,
        ),
      ),
    ).rejects.toThrow('Transaction 2 of 2 cannot be simulated before the ones ahead of it land');
  });

  it('refuses format "instructions" for several transactions', async () => {
    const fake = fakeSolana();
    await expect(
      captureUnsignedTransaction({ format: 'instructions' }, () =>
        sequence.call(
          fake,
          [
            { transaction: legacyTx(wallet.publicKey, Keypair.generate().publicKey) },
            { transaction: legacyTx(wallet.publicKey, Keypair.generate().publicKey), computeUnits: 1 },
          ],
          walletAddress,
        ),
      ),
    ).rejects.toThrow('This operation takes 2 transactions');
  });
});

/**
 * Unit tests for the wallet-type-agnostic chokepoint
 * Solana.sendAndConfirmTransactionForWallet.
 *
 * The method is exercised via Function.prototype.call against a hand-built `this`: the
 * real preparation and signing, with RPC and broadcast stubbed and the wallet's signer
 * supplied by the registry mock.
 */

import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';

import { Solana } from '../../../src/chains/solana/solana';

const mockGetSolanaSigner = jest.fn();
jest.mock('../../../src/wallet/signers/registry', () => ({
  ...jest.requireActual('../../../src/wallet/signers/registry'),
  getSolanaSigner: (address: string) => mockGetSolanaSigner(address),
}));

const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

const chokepoint = (Solana.prototype as any).sendAndConfirmTransactionForWallet as (
  this: unknown,
  tx: Transaction | VersionedTransaction,
  address: string,
  extraSigners?: Keypair[],
  priorityFeePerCU?: number,
) => Promise<{ signature: string; fee: number }>;

/** A signer backed by a keypair, standing in for any backend that holds the key. */
function keypairSigner(keypair: Keypair, kind: 'local' | 'hardware' = 'local') {
  return {
    kind,
    address: keypair.publicKey.toBase58(),
    signTransactionMessage: jest.fn(async (message: Uint8Array) => ({
      kind: 'signed' as const,
      value: nacl.sign.detached(message, keypair.secretKey),
    })),
  };
}

/** A `this` for the chokepoint: the real preparation and signing, RPC and broadcast stubbed. */
function chokepointThis(overrides: Record<string, unknown> = {}) {
  return {
    simulateWithErrorHandling: jest.fn(),
    estimateGasPrice: jest.fn(async () => 0.00001),
    prepareVersionedTx: (Solana.prototype as any).prepareVersionedTx,
    signThroughSeam: (Solana.prototype as any).signThroughSeam,
    _sendAndConfirmRawTransaction: jest.fn(async () => ({
      confirmed: true,
      signature: 'sig',
      txData: { meta: { fee: 5000 } },
    })),
    getFee: jest.fn(() => 0.000005),
    config: { defaultComputeUnits: 200000 },
    connection: {
      simulateTransaction: jest.fn(async () => ({ value: { err: null, unitsConsumed: 100000 } })),
      getLatestBlockhashAndContext: jest.fn(async () => ({
        value: { lastValidBlockHeight: 100, blockhash: BLOCKHASH },
      })),
    },
    ...overrides,
  };
}

/** The wire transaction the chokepoint broadcast. */
function broadcast(fakeThis: { _sendAndConfirmRawTransaction: jest.Mock }): Transaction {
  const [raw] = fakeThis._sendAndConfirmRawTransaction.mock.calls[0] as [Uint8Array];
  return Transaction.from(raw);
}

function createAccountTx(payer: PublicKey, account: PublicKey): Transaction {
  return new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account,
      lamports: 1,
      space: 82,
      programId: SystemProgram.programId,
    }),
  );
}

describe('Solana.sendAndConfirmTransactionForWallet (the signer seam)', () => {
  const wallet = Keypair.generate();
  const walletAddress = wallet.publicKey.toBase58();

  afterEach(() => mockGetSolanaSigner.mockReset());

  it("signs the prepared message through the wallet's signer and sends a transaction that verifies", async () => {
    const signer = keypairSigner(wallet, 'hardware');
    mockGetSolanaSigner.mockResolvedValue(signer);
    const nftMint = Keypair.generate();
    const fakeThis = chokepointThis();

    const result = await chokepoint.call(
      fakeThis,
      createAccountTx(wallet.publicKey, nftMint.publicKey),
      walletAddress,
      [nftMint],
    );

    expect(result).toEqual({ signature: 'sig', fee: 0.000005 });
    expect(signer.signTransactionMessage).toHaveBeenCalledTimes(1);
    const sent = broadcast(fakeThis);
    // Gateway's compute budget is in the message the wallet signed.
    expect(sent.instructions.filter((ix) => ix.programId.toBase58().startsWith('ComputeBudget'))).toHaveLength(2);
    // The wallet and the ephemeral co-signer both signed, over the final message.
    expect(sent.verifySignatures()).toBe(true);
    expect(sent.signatures.map((s) => s.publicKey.toBase58()).sort()).toEqual(
      [walletAddress, nftMint.publicKey.toBase58()].sort(),
    );
  });

  it('replaces stale CU price/limit on a legacy tx but preserves RequestHeapFrame', async () => {
    // Titan's programs need a 256KB heap and crash on-chain if RequestHeapFrame is stripped.
    mockGetSolanaSigner.mockResolvedValue(keypairSigner(wallet));
    const fakeThis = chokepointThis();
    const tx = new Transaction().add(
      ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 99 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1234 }),
      SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: wallet.publicKey, lamports: 1 }),
    );

    await chokepoint.call(fakeThis, tx, walletAddress);

    const sent = broadcast(fakeThis);
    const cbData = sent.instructions
      .filter((ix) => ix.programId.equals(ComputeBudgetProgram.programId))
      .map((ix) => ix.data[0])
      .sort();
    expect(cbData).toEqual([1, 2, 3]);
    expect(sent.instructions).toHaveLength(4);
  });

  it('drops extra signers that carry the wallet pubkey (SDK dummy owner signers)', async () => {
    // Raydium's TxBuilder appends `owner.signer` to the signers it returns: a dummy
    // keypair whose publicKey is the wallet's. Signing with it would corrupt the
    // wallet's slot.
    mockGetSolanaSigner.mockResolvedValue(keypairSigner(wallet));
    const dummyOwner = Keypair.generate();
    Object.defineProperty(dummyOwner, 'publicKey', { get: () => wallet.publicKey, configurable: true });
    const nftMint = Keypair.generate();
    const fakeThis = chokepointThis();

    await chokepoint.call(fakeThis, createAccountTx(wallet.publicKey, nftMint.publicKey), walletAddress, [
      dummyOwner,
      nftMint,
    ]);

    expect(broadcast(fakeThis).verifySignatures()).toBe(true);
  });

  it('defaults a missing fee payer to the wallet before simulating a legacy tx (regression)', async () => {
    mockGetSolanaSigner.mockResolvedValue(keypairSigner(wallet));
    const fakeThis = chokepointThis();
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: wallet.publicKey, lamports: 1 }),
    );
    expect(tx.feePayer).toBeUndefined();

    await chokepoint.call(fakeThis, tx, walletAddress);

    expect(fakeThis.simulateWithErrorHandling).toHaveBeenCalledWith(tx);
    expect(broadcast(fakeThis).feePayer?.toBase58()).toBe(walletAddress);
  });

  it('signs a versioned transaction without moving its fee payer', async () => {
    mockGetSolanaSigner.mockResolvedValue(keypairSigner(wallet));
    const fakeThis = chokepointThis();
    const message = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: wallet.publicKey, lamports: 1 })],
    }).compileToV0Message();

    await chokepoint.call(fakeThis, new VersionedTransaction(message), walletAddress);

    const [raw] = fakeThis._sendAndConfirmRawTransaction.mock.calls[0] as unknown as [Uint8Array];
    const sent = VersionedTransaction.deserialize(raw);
    expect(sent.message.staticAccountKeys[0].toBase58()).toBe(walletAddress);
    expect(
      nacl.sign.detached.verify(
        new Uint8Array(sent.message.serialize()),
        sent.signatures[0],
        wallet.publicKey.toBytes(),
      ),
    ).toBe(true);
  });

  it('refuses an external wallet before any RPC work', async () => {
    mockGetSolanaSigner.mockResolvedValue({
      kind: 'external',
      address: walletAddress,
      signTransactionMessage: jest.fn(),
    });
    const fakeThis = chokepointThis();

    await expect(
      chokepoint.call(fakeThis, createAccountTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('is an external wallet') });
    expect(fakeThis.simulateWithErrorHandling).not.toHaveBeenCalled();
    expect(fakeThis._sendAndConfirmRawTransaction).not.toHaveBeenCalled();
  });

  it('does not send a signature that does not verify against the message', async () => {
    const signer = keypairSigner(Keypair.generate());
    mockGetSolanaSigner.mockResolvedValue({ ...signer, address: walletAddress });
    const fakeThis = chokepointThis();

    await expect(
      chokepoint.call(fakeThis, createAccountTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    ).rejects.toThrow(/does not verify against the transaction/);
    expect(fakeThis._sendAndConfirmRawTransaction).not.toHaveBeenCalled();
  });

  it('does not broadcast when the compute-estimation simulation returned an error', async () => {
    mockGetSolanaSigner.mockResolvedValue(keypairSigner(wallet));
    const fakeThis = chokepointThis({
      connection: {
        simulateTransaction: jest.fn(async () => ({
          value: {
            err: { InstructionError: [0, { Custom: 6018 }] },
            unitsConsumed: 10385,
            logs: [
              'Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc invoke [1]',
              'Program whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc failed: custom program error: 0x1782',
            ],
          },
        })),
      },
    });

    await expect(
      chokepoint.call(fakeThis, createAccountTx(wallet.publicKey, Keypair.generate().publicKey), walletAddress),
    ).rejects.toMatchObject({ code: 'SLIPPAGE_EXCEEDED' });
    expect(fakeThis._sendAndConfirmRawTransaction).not.toHaveBeenCalled();
  });
});

describe('Solana.throwIfLandedWithError / confirmationTimeoutError', () => {
  const throwIfLandedWithError = (Solana.prototype as any).throwIfLandedWithError as (
    this: unknown,
    signature: string,
    txData?: any,
  ) => Promise<void>;
  const confirmationTimeoutError = (Solana.prototype as any).confirmationTimeoutError as (
    this: unknown,
    signature: string,
  ) => Error;

  it('surfaces the on-chain program error when a tx lands but fails (not a timeout)', async () => {
    const fakeThis = {
      buildLandedWithErrorException: (Solana.prototype as any).buildLandedWithErrorException,
      connection: {
        getTransaction: jest.fn(async () => ({
          meta: {
            err: { InstructionError: [1, { Custom: 6001 }] },
            logMessages: [
              'Program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo invoke [1]',
              'Program LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo failed: custom program error: 0x1771',
            ],
          },
        })),
      },
    };

    const error = await throwIfLandedWithError.call(fakeThis, 'landed-sig').then(
      () => {
        throw new Error('expected throwIfLandedWithError to throw');
      },
      (e: any) => e,
    );
    // A landed-but-failed tx paid fees on-chain — it is TRANSACTION_FAILED (4xx,
    // non-retryable), not a simulation failure, and the message keeps the signature.
    expect(error.message).toMatch(/Transaction landed-sig landed on-chain but failed/);
    expect(error.code).toBe('TRANSACTION_FAILED');
    expect(error.statusCode).toBe(400);
  });

  it('uses caller-provided txData without a re-fetch and throws the shared landed-but-failed error', async () => {
    const getTransaction = jest.fn();
    const fakeThis = {
      buildLandedWithErrorException: (Solana.prototype as any).buildLandedWithErrorException,
      connection: { getTransaction },
    };

    const failedTxData = { meta: { err: { InstructionError: [0, 'Custom'] }, logMessages: [] } };
    const error = await throwIfLandedWithError.call(fakeThis as any, 'route-sig', failedTxData).then(
      () => {
        throw new Error('expected throwIfLandedWithError to throw');
      },
      (e: any) => e,
    );
    expect(error.code).toBe('TRANSACTION_FAILED');
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it('returns silently when the transaction succeeded or is missing', async () => {
    const succeeded = { connection: { getTransaction: jest.fn(async () => ({ meta: { err: null } })) } };
    await expect(throwIfLandedWithError.call(succeeded, 'ok-sig')).resolves.toBeUndefined();

    const missing = { connection: { getTransaction: jest.fn(async () => null) } };
    await expect(throwIfLandedWithError.call(missing, 'gone-sig')).resolves.toBeUndefined();
  });

  it('includes the signature in the timeout error so callers can reconcile', () => {
    const error = confirmationTimeoutError.call({}, 'timeout-sig');
    expect(error.message).toMatch(/timeout-sig was not confirmed before its blockhash expired/);
    expect(confirmationTimeoutError.call({}, '').message).toMatch(/Transaction failed to send/);
  });
});

describe('Solana._confirmViaPolling', () => {
  const confirmViaPolling = (Solana.prototype as any)._confirmViaPolling as (
    this: unknown,
    signature: string,
    lastValidBlockHeight: number,
  ) => Promise<{ confirmed: boolean; txData: any }>;

  it('keeps polling past confirmRetryCount while the blockhash is still valid', async () => {
    // QA scenario: minimum-priority-fee tx confirms AFTER the old fixed attempt window.
    let statusCalls = 0;
    const fakeThis = {
      config: { confirmRetryCount: 2, confirmRetryInterval: 0.001 },
      connection: {
        getSignatureStatuses: jest.fn(async () => {
          statusCalls++;
          return statusCalls < 5 ? { value: [null] } : { value: [{ err: null, confirmationStatus: 'confirmed' }] };
        }),
        getBlockHeight: jest.fn(async () => 100), // blockhash never expires during the test
      },
      _fetchTransactionWithRetry: jest.fn(async () => ({ meta: { err: null } })),
    };

    const result = await confirmViaPolling.call(fakeThis, 'sig', 200);

    expect(result.confirmed).toBe(true);
    expect(statusCalls).toBeGreaterThan(2); // old behavior gave up at confirmRetryCount
  });

  it('does a final on-chain lookup before reporting a timeout, and trusts it', async () => {
    // The signature-status cache can miss a landed tx; the final getTransaction check
    // must rescue it instead of reporting a 504 for a confirmed transaction.
    const fakeThis = {
      config: { confirmRetryCount: 1, confirmRetryInterval: 0.001 },
      connection: {
        getSignatureStatuses: jest.fn(async () => ({ value: [null] })),
        getBlockHeight: jest.fn(async () => 300), // blockhash already expired
      },
      _fetchTransactionWithRetry: jest.fn(async () => ({ meta: { err: null } })),
    };

    const result = await confirmViaPolling.call(fakeThis, 'sig', 200);

    expect(result.confirmed).toBe(true);
    expect(fakeThis._fetchTransactionWithRetry).toHaveBeenCalled();
  });

  it('reports unconfirmed when the blockhash expires and the tx is nowhere on-chain', async () => {
    const fakeThis = {
      config: { confirmRetryCount: 1, confirmRetryInterval: 0.001 },
      connection: {
        getSignatureStatuses: jest.fn(async () => ({ value: [null] })),
        getBlockHeight: jest.fn(async () => 300),
      },
      _fetchTransactionWithRetry: jest.fn(async () => null),
    };

    const result = await confirmViaPolling.call(fakeThis, 'sig', 200);

    expect(result).toEqual({ confirmed: false, txData: null });
  });
});

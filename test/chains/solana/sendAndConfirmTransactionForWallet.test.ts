/**
 * Unit tests for the wallet-type-agnostic chokepoint
 * Solana.sendAndConfirmTransactionForWallet.
 *
 * The method is exercised via Function.prototype.call against a hand-built `this`, so we can
 * assert its branching (local vs hardware) and the fee-payer defaulting without standing up
 * the full Solana singleton / RPC.
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';

const WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

const chokepoint = (Solana.prototype as any).sendAndConfirmTransactionForWallet as (
  this: unknown,
  tx: Transaction | VersionedTransaction,
  address: string,
  extraSigners?: Keypair[],
  priorityFeePerCU?: number,
) => Promise<{ signature: string; fee: number }>;

function legacyTx(): Transaction {
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey: new PublicKey(WALLET), toPubkey: new PublicKey(WALLET), lamports: 1 }));
  return tx;
}

function versionedTx(): VersionedTransaction {
  const payer = new PublicKey(WALLET);
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 1 })],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

describe('Solana.sendAndConfirmTransaction compute simulation', () => {
  const sendAndConfirm = (Solana.prototype as any).sendAndConfirmTransaction as (
    this: unknown,
    tx: Transaction,
  ) => Promise<{ signature: string; fee: number }>;

  it('does not broadcast when the compute-estimation simulation returned an error', async () => {
    const _sendAndConfirmRawTransaction = jest.fn();
    const fakeThis = {
      config: { defaultComputeUnits: 200000 },
      estimateGasPrice: jest.fn(async () => 0.1),
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
      _sendAndConfirmRawTransaction,
    };

    await expect(sendAndConfirm.call(fakeThis, legacyTx())).rejects.toMatchObject({
      code: 'SLIPPAGE_EXCEEDED',
    });
    expect(_sendAndConfirmRawTransaction).not.toHaveBeenCalled();
  });
});

describe('Solana.sendAndConfirmTransactionForWallet', () => {
  it('drops extra signers that carry the wallet pubkey (SDK dummy owner signers)', async () => {
    // Raydium's TxBuilder appends `owner.signer` to the signers it returns. For non-local
    // wallets that is a dummy keypair whose publicKey getter returns the wallet's address;
    // signing with it corrupts the wallet's signature slot.
    const walletKeypair = Keypair.generate();
    const sendAndConfirmTransaction = jest.fn(async () => ({ signature: 'sig', fee: 0.0001 }));
    const fakeThis = {
      simulateWithErrorHandling: jest.fn(),
      prepareWallet: jest.fn(async () => ({ wallet: walletKeypair, walletType: 'local' })),
      sendAndConfirmTransaction,
      estimateGasPrice: jest.fn(async () => 0.00001),
      config: { confirmRetryCount: 3 },
    };

    const dummyOwner = Keypair.generate();
    Object.defineProperty(dummyOwner, 'publicKey', { get: () => new PublicKey(WALLET), configurable: true });
    const nftMint = Keypair.generate();

    await chokepoint.call(fakeThis, legacyTx(), WALLET, [dummyOwner, nftMint], 0.00001);

    const [, signers] = sendAndConfirmTransaction.mock.calls[0] as any[];
    expect(signers).toEqual([walletKeypair, nftMint]);
  });

  it('defaults a missing fee payer to the wallet before simulating a legacy tx (regression)', async () => {
    const simulateWithErrorHandling = jest.fn();
    const sendAndConfirmTransaction = jest.fn(async () => ({ signature: 'local-sig', fee: 0.0001 }));
    const fakeThis = {
      simulateWithErrorHandling,
      prepareWallet: jest.fn(async () => ({ wallet: Keypair.generate(), walletType: 'local' })),
      sendAndConfirmTransaction,
      estimateGasPrice: jest.fn(async () => 0.00001),
      config: { confirmRetryCount: 3 },
    };

    const tx = legacyTx();
    expect(tx.feePayer).toBeUndefined();

    const result = await chokepoint.call(fakeThis, tx, WALLET);

    // The fix: fee payer is set to the wallet so simulate can compile the message.
    expect(tx.feePayer?.toBase58()).toBe(WALLET);
    // simulate happens, and with a compilable tx (the bug was a throw here).
    expect(simulateWithErrorHandling).toHaveBeenCalledWith(tx);
    expect(simulateWithErrorHandling).toHaveBeenCalledTimes(1);
    expect(sendAndConfirmTransaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ signature: 'local-sig', fee: 0.0001 });
  });

  it('signs via signTransactionByType for hardware wallets and re-applies extra signers', async () => {
    // The hardware wallet is represented by a keypair so the test can produce a
    // verifiable signature; in production the Ledger signs this slot.
    const walletKeypair = Keypair.generate();
    const walletAddress = walletKeypair.publicKey.toBase58();
    const nftMint = Keypair.generate();

    const signTransactionByType = jest.fn(async (tx: Transaction, _address?: string, _walletType?: string) => {
      tx.partialSign(walletKeypair);
      return tx;
    });
    const _sendAndConfirmRawTransaction = jest.fn(async () => ({
      confirmed: true,
      signature: 'hw-sig',
      txData: { meta: { fee: 5000 } },
    }));
    const fakeThis = {
      simulateWithErrorHandling: jest.fn(),
      prepareWallet: jest.fn(async () => ({ wallet: walletKeypair.publicKey, walletType: 'hardware' })),
      signTransactionByType,
      _sendAndConfirmRawTransaction,
      getFee: jest.fn(() => 0.000005),
      estimateGasPrice: jest.fn(async () => 0.00001),
      config: { confirmRetryCount: 3, defaultComputeUnits: 200000 },
      connection: {
        simulateTransaction: jest.fn(async () => ({ value: { unitsConsumed: 100000 } })),
        getLatestBlockhashAndContext: jest.fn(async () => ({
          value: { lastValidBlockHeight: 100, blockhash: BLOCKHASH },
        })),
      },
    };

    // Like a real openPosition tx: the ephemeral mint account is itself a required signer.
    const tx = new Transaction();
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: walletKeypair.publicKey,
        newAccountPubkey: nftMint.publicKey,
        lamports: 1,
        space: 82,
        programId: SystemProgram.programId,
      }),
    );

    const result = await chokepoint.call(fakeThis, tx, walletAddress, [nftMint], 0.00001);

    expect(result).toEqual({ signature: 'hw-sig', fee: 0.000005 });
    // Signed through the wallet-type-specific signer, not a local keypair path.
    expect(signTransactionByType).toHaveBeenCalledTimes(1);
    expect(signTransactionByType.mock.calls[0][2]).toBe('hardware');
    // The prepared tx got Gateway's compute budget instructions before signing.
    const preparedTx = signTransactionByType.mock.calls[0][0] as Transaction;
    const cbCount = preparedTx.instructions.filter((ix) => ix.programId.toBase58().startsWith('ComputeBudget')).length;
    expect(cbCount).toBe(2); // CU price + CU limit
    // Both the wallet and the ephemeral extra signer ended up signed.
    const signedPubkeys = preparedTx.signatures.filter((s) => s.signature !== null).map((s) => s.publicKey.toBase58());
    expect(signedPubkeys).toContain(walletKeypair.publicKey.toBase58());
    expect(signedPubkeys).toContain(nftMint.publicKey.toBase58());
    expect(_sendAndConfirmRawTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not touch the fee payer of a versioned tx (it is baked into the message)', async () => {
    const simulateWithErrorHandling = jest.fn();
    const sendAndConfirmTransaction = jest.fn(async () => ({ signature: 'v0-sig', fee: 0.0002 }));
    const fakeThis = {
      simulateWithErrorHandling,
      prepareWallet: jest.fn(async () => ({ wallet: Keypair.generate(), walletType: 'local' })),
      sendAndConfirmTransaction,
      estimateGasPrice: jest.fn(async () => 0.00001),
      config: { confirmRetryCount: 3 },
    };

    const tx = versionedTx();
    const result = await chokepoint.call(fakeThis, tx, WALLET);

    expect(simulateWithErrorHandling).toHaveBeenCalledWith(tx);
    expect(result).toEqual({ signature: 'v0-sig', fee: 0.0002 });
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

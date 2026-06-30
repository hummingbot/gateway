/**
 * Unit tests for the wallet-type-agnostic chokepoint
 * Solana.sendAndConfirmTransactionForWallet and the Swig delegate-signer resolver.
 *
 * The method is exercised via Function.prototype.call against a hand-built `this`, so we can
 * assert its branching (Swig vs local) and the fee-payer defaulting without standing up the
 * full Solana singleton / RPC.
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

const resolveDelegate = (Solana.prototype as any).getSwigDelegateSigner as (
  this: unknown,
  swigWallet: unknown,
) => Promise<unknown>;

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

describe('Solana.sendAndConfirmTransactionForWallet', () => {
  it('routes Swig wallets through rebuildAndSignSwigTransaction and skips the simulate', async () => {
    const rebuildAndSignSwigTransaction = jest.fn(async () => ({ serialize: () => new Uint8Array([1, 2, 3]) }));
    const simulateWithErrorHandling = jest.fn();
    const _sendAndConfirmRawTransaction = jest.fn(async () => ({
      confirmed: true,
      signature: 'swig-sig',
      txData: { meta: { fee: 5000 } },
    }));
    const fakeThis = {
      isSwigWallet: jest.fn(async () => true),
      rebuildAndSignSwigTransaction,
      simulateWithErrorHandling,
      _sendAndConfirmRawTransaction,
      getFee: jest.fn(() => 0.000005),
      estimateGasPrice: jest.fn(async () => 0.00001),
      config: { confirmRetryCount: 3 },
    };

    const tx = legacyTx();
    const extra = [Keypair.generate()];
    const result = await chokepoint.call(fakeThis, tx, WALLET, extra, 0.00002);

    expect(result).toEqual({ signature: 'swig-sig', fee: 0.000005 });
    // Swig path must NOT pre-flight simulate (the unsigned PDA tx is only executable post-wrap).
    expect(simulateWithErrorHandling).not.toHaveBeenCalled();
    expect(rebuildAndSignSwigTransaction).toHaveBeenCalledTimes(1);
    const [, addrArg, opts] = rebuildAndSignSwigTransaction.mock.calls[0] as any[];
    expect(addrArg).toBe(WALLET);
    expect(opts.extraSigners).toBe(extra);
    // 0.00002 SOL/CU * 1e6 = 20 micro-lamports
    expect(opts.priorityFeeMicroLamports).toBe(20);
  });

  it('defaults a missing fee payer to the wallet before simulating a legacy tx (regression)', async () => {
    const simulateWithErrorHandling = jest.fn();
    const sendAndConfirmTransaction = jest.fn(async () => ({ signature: 'local-sig', fee: 0.0001 }));
    const fakeThis = {
      isSwigWallet: jest.fn(async () => false),
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

  it('does not touch the fee payer of a versioned tx (it is baked into the message)', async () => {
    const simulateWithErrorHandling = jest.fn();
    const sendAndConfirmTransaction = jest.fn(async () => ({ signature: 'v0-sig', fee: 0.0002 }));
    const fakeThis = {
      isSwigWallet: jest.fn(async () => false),
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

  it('throws a transaction-timeout error when a Swig tx never confirms', async () => {
    const fakeThis = {
      isSwigWallet: jest.fn(async () => true),
      rebuildAndSignSwigTransaction: jest.fn(async () => ({ serialize: () => new Uint8Array([1]) })),
      _sendAndConfirmRawTransaction: jest.fn(async () => ({ confirmed: false, signature: '', txData: null })),
      getFee: jest.fn(),
      estimateGasPrice: jest.fn(async () => 0.00001),
      config: { confirmRetryCount: 4 },
    };

    await expect(chokepoint.call(fakeThis, legacyTx(), WALLET, [], 0.00001)).rejects.toThrow(
      /confirm after 4 attempts/,
    );
  });
});

describe('Solana.getSwigDelegateSigner', () => {
  it('builds a LocalKeystoreDelegateSigner for a local delegate', async () => {
    const delegateKeypair = Keypair.generate();
    const fakeThis = { getWallet: jest.fn(async () => delegateKeypair) };
    const signer: any = await resolveDelegate.call(fakeThis, {
      address: WALLET,
      delegateAddress: delegateKeypair.publicKey.toBase58(),
      delegateSigner: 'local',
    });
    expect(signer.publicKey.equals(delegateKeypair.publicKey)).toBe(true);
    expect(fakeThis.getWallet).toHaveBeenCalledWith(delegateKeypair.publicKey.toBase58());
  });

  it('throws a clear not-implemented error for the kms backend', async () => {
    const fakeThis = { getWallet: jest.fn() };
    await expect(
      resolveDelegate.call(fakeThis, { address: WALLET, delegateAddress: WALLET, delegateSigner: 'kms' }),
    ).rejects.toThrow(/KMS delegate signer is not implemented/);
    expect(fakeThis.getWallet).not.toHaveBeenCalled();
  });

  it('defaults to the local backend when delegateSigner is absent', async () => {
    const delegateKeypair = Keypair.generate();
    const fakeThis = { getWallet: jest.fn(async () => delegateKeypair) };
    const signer: any = await resolveDelegate.call(fakeThis, {
      address: WALLET,
      delegateAddress: delegateKeypair.publicKey.toBase58(),
    });
    expect(signer.publicKey.equals(delegateKeypair.publicKey)).toBe(true);
  });

  it('rejects an unknown delegate signer type', async () => {
    const fakeThis = { getWallet: jest.fn() };
    await expect(
      resolveDelegate.call(fakeThis, { address: WALLET, delegateAddress: WALLET, delegateSigner: 'vault' }),
    ).rejects.toThrow(/Unknown Swig delegate signer type/);
  });
});

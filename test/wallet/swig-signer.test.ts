import { createCloseAccountInstruction } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

jest.mock('../../src/wallet/swig/swig-service');

import { LocalKeystoreDelegateSigner } from '../../src/wallet/swig/delegate-signer';
import { getSwigService } from '../../src/wallet/swig/swig-service';
import { SwigSolanaSigner } from '../../src/wallet/swig/swig-signer';

const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

describe('SwigSolanaSigner.rebuildAndSign', () => {
  const delegate = Keypair.generate();
  const account = Keypair.generate().publicKey;
  const walletAddress = Keypair.generate().publicKey;
  let wrapInstructions: jest.Mock;
  let getAccountInfo: jest.Mock;
  let connection: Connection;

  beforeEach(() => {
    jest.clearAllMocks();
    // Identity wrap: the "wrapped" instructions are just the inner ones, so we can assert
    // exactly which instructions were passed for wrapping.
    wrapInstructions = jest.fn(async (_swig: unknown, _pk: PublicKey, inner: unknown[]) => inner);
    (getSwigService as jest.Mock).mockReturnValue({
      fetchSwig: jest.fn(async () => ({})),
      getWalletAddress: jest.fn(async () => walletAddress),
      wrapInstructions,
    });
    // Default: no account pre-exists, so no CloseAccount cleanup gets dropped.
    getAccountInfo = jest.fn(async () => null);
    connection = {
      getLatestBlockhash: jest.fn(async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1 })),
      getAccountInfo,
    } as unknown as Connection;
  });

  it('drops compute-budget ixs, wraps the rest, and signs with the delegate as fee payer', async () => {
    const swigWallet = Keypair.generate().publicKey;
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
    tx.add(SystemProgram.transfer({ fromPubkey: swigWallet, toPubkey: swigWallet, lamports: 1 }));

    const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));
    const out = await signer.rebuildAndSign(tx, { priorityFeeMicroLamports: 1000 });

    // Only the transfer (non-compute-budget) instruction was wrapped.
    expect(wrapInstructions).toHaveBeenCalledTimes(1);
    const wrappedInner = wrapInstructions.mock.calls[0][2];
    expect(wrappedInner).toHaveLength(1);
    expect(wrappedInner[0].programId.equals(SystemProgram.programId)).toBe(true);

    // The delegate is the fee payer (first static account) and the transaction is signed.
    expect(out).toBeInstanceOf(VersionedTransaction);
    expect(out.message.staticAccountKeys[0].equals(delegate.publicKey)).toBe(true);
    expect(out.signatures[0].some((b) => b !== 0)).toBe(true);
  });

  it('throws when there are no inner instructions to wrap', async () => {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
    const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));
    await expect(signer.rebuildAndSign(tx)).rejects.toThrow('no instructions to wrap');
  });

  describe('CloseAccount cleanup of pre-existing wallet token accounts (swig-wallet#185)', () => {
    // Closing a token account the wallet already owned when the transaction starts panics
    // the deployed Swig program. SDK-built cleanup (e.g. Jupiter's WSOL unwrap) must be
    // dropped when the account pre-exists, and kept when it is created in-transaction.
    const ata = Keypair.generate().publicKey;

    const txWithClose = (authority: PublicKey) => {
      const tx = new Transaction();
      tx.add(SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: walletAddress, lamports: 1 }));
      tx.add(createCloseAccountInstruction(ata, walletAddress, authority));
      return tx;
    };

    it('drops the close when the account pre-exists and the wallet is the authority', async () => {
      getAccountInfo.mockResolvedValue({ lamports: 2_039_280 });
      const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));

      await signer.rebuildAndSign(txWithClose(walletAddress));

      const wrappedInner = wrapInstructions.mock.calls[0][2];
      expect(wrappedInner).toHaveLength(1); // only the transfer survived
      expect(wrappedInner[0].programId.equals(SystemProgram.programId)).toBe(true);
      expect(getAccountInfo).toHaveBeenCalledWith(ata);
    });

    it('keeps the close when the account does not exist yet (created in-transaction)', async () => {
      getAccountInfo.mockResolvedValue(null);
      const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));

      await signer.rebuildAndSign(txWithClose(walletAddress));

      const wrappedInner = wrapInstructions.mock.calls[0][2];
      expect(wrappedInner).toHaveLength(2);
    });

    it('keeps the close when the authority is not the wallet (not snapshotted as a wallet account)', async () => {
      getAccountInfo.mockResolvedValue({ lamports: 2_039_280 });
      const otherAuthority = Keypair.generate().publicKey;
      const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));

      await signer.rebuildAndSign(txWithClose(otherAuthority));

      const wrappedInner = wrapInstructions.mock.calls[0][2];
      expect(wrappedInner).toHaveLength(2);
      expect(getAccountInfo).not.toHaveBeenCalled();
    });

    it('throws a root-owner hint when the transaction ONLY closes pre-existing wallet accounts', async () => {
      getAccountInfo.mockResolvedValue({ lamports: 2_039_280 });
      const tx = new Transaction();
      tx.add(createCloseAccountInstruction(ata, walletAddress, walletAddress));
      const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));

      await expect(signer.rebuildAndSign(tx)).rejects.toThrow(/root owner authority/);
    });
  });

  it('injects compute-budget ixs (limit + price) when the tx has none', async () => {
    const swigWallet = Keypair.generate().publicKey;
    const tx = new Transaction();
    tx.add(SystemProgram.transfer({ fromPubkey: swigWallet, toPubkey: swigWallet, lamports: 1 }));

    const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));
    const out = await signer.rebuildAndSign(tx, { priorityFeeMicroLamports: 2500, computeUnitLimit: 321_000 });

    // The wrapped set passed for signing is [CU-limit, CU-price, ...wrapped inner]. We assert
    // the two compute-budget ixs were prepended by checking the compiled program ids.
    const programIds = out.message.compiledInstructions.map((ci) =>
      out.message.staticAccountKeys[ci.programIdIndex].toBase58(),
    );
    const computeBudgetCount = programIds.filter((id) => id === ComputeBudgetProgram.programId.toBase58()).length;
    expect(computeBudgetCount).toBe(2);
  });

  it('co-signs with extraSigners before the delegate signs the fee-payer slot', async () => {
    const swigWallet = Keypair.generate().publicKey;
    const extra = Keypair.generate();
    const tx = new Transaction();
    // An instruction that requires the extra signer as a signer key.
    tx.add(SystemProgram.transfer({ fromPubkey: extra.publicKey, toPubkey: swigWallet, lamports: 1 }));

    const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));
    const out = await signer.rebuildAndSign(tx, { extraSigners: [extra] });

    // Both the delegate (fee payer, slot 0) and the extra signer produced non-empty signatures.
    const keys = out.message.staticAccountKeys.map((k) => k.toBase58());
    const extraIdx = keys.indexOf(extra.publicKey.toBase58());
    expect(out.message.staticAccountKeys[0].equals(delegate.publicKey)).toBe(true);
    expect(out.signatures[0].some((b) => b !== 0)).toBe(true);
    expect(extraIdx).toBeGreaterThanOrEqual(0);
    expect(out.signatures[extraIdx].some((b) => b !== 0)).toBe(true);
  });

  describe('versioned / address-lookup-table path', () => {
    const lookupKey = Keypair.generate().publicKey;
    const lookedUpAddress = Keypair.generate().publicKey;

    function versionedTxWithLookup(): VersionedTransaction {
      const payer = Keypair.generate().publicKey;
      const lookupTable = new AddressLookupTableAccount({
        key: lookupKey,
        state: {
          deactivationSlot: BigInt('18446744073709551615'),
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          authority: payer,
          addresses: [lookedUpAddress],
        },
      });
      const message = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: BLOCKHASH,
        instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: lookedUpAddress, lamports: 1 })],
      }).compileToV0Message([lookupTable]);
      return new VersionedTransaction(message);
    }

    it('resolves lookup tables, decompiles, wraps and signs', async () => {
      const tx = versionedTxWithLookup();
      (connection as any).getAddressLookupTable = jest.fn(async (key: PublicKey) => {
        expect(key.equals(lookupKey)).toBe(true);
        return {
          value: new AddressLookupTableAccount({
            key: lookupKey,
            state: {
              deactivationSlot: BigInt('18446744073709551615'),
              lastExtendedSlot: 0,
              lastExtendedSlotStartIndex: 0,
              authority: undefined,
              addresses: [lookedUpAddress],
            },
          }),
        };
      });

      const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));
      const out = await signer.rebuildAndSign(tx);

      expect((connection as any).getAddressLookupTable).toHaveBeenCalledTimes(1);
      // The transfer instruction was decompiled and wrapped (identity wrap).
      expect(wrapInstructions).toHaveBeenCalledTimes(1);
      expect(wrapInstructions.mock.calls[0][2]).toHaveLength(1);
      expect(out).toBeInstanceOf(VersionedTransaction);
    });

    it('throws when a referenced lookup table is missing', async () => {
      const tx = versionedTxWithLookup();
      (connection as any).getAddressLookupTable = jest.fn(async () => ({ value: null }));

      const signer = new SwigSolanaSigner(connection, account, new LocalKeystoreDelegateSigner(delegate));
      await expect(signer.rebuildAndSign(tx)).rejects.toThrow(/Address lookup table not found/);
    });
  });
});

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
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
  let wrapInstructions: jest.Mock;
  let connection: Connection;

  beforeEach(() => {
    jest.clearAllMocks();
    // Identity wrap: the "wrapped" instructions are just the inner ones, so we can assert
    // exactly which instructions were passed for wrapping.
    wrapInstructions = jest.fn(async (_swig: unknown, _pk: PublicKey, inner: unknown[]) => inner);
    (getSwigService as jest.Mock).mockReturnValue({
      fetchSwig: jest.fn(async () => ({})),
      wrapInstructions,
    });
    connection = {
      getLatestBlockhash: jest.fn(async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1 })),
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
});

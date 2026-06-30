import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { LocalKeystoreDelegateSigner } from '../../src/wallet/swig/delegate-signer';

const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

function compileTx(payer: Keypair): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

describe('LocalKeystoreDelegateSigner', () => {
  it('exposes the keypair public key', () => {
    const kp = Keypair.generate();
    const signer = new LocalKeystoreDelegateSigner(kp);
    expect(signer.publicKey.equals(kp.publicKey)).toBe(true);
  });

  it('signs the fee-payer slot in place with a valid signature', async () => {
    const kp = Keypair.generate();
    const tx = compileTx(kp);
    expect(tx.signatures[0].every((b) => b === 0)).toBe(true);

    await new LocalKeystoreDelegateSigner(kp).sign(tx);

    // Signature slot is filled and the transaction verifies against the fee payer.
    expect(tx.signatures[0].some((b) => b !== 0)).toBe(true);
    const ok = require('tweetnacl').sign.detached.verify(
      tx.message.serialize(),
      tx.signatures[0],
      kp.publicKey.toBytes(),
    );
    expect(ok).toBe(true);
  });
});

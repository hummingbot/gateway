import { Keypair } from '@solana/web3.js';

import { kitInstructionToWeb3 } from '../../../src/chains/solana/kit-instructions';

describe('kitInstructionToWeb3', () => {
  it('maps program id, account role bits and data', () => {
    const program = Keypair.generate().publicKey;
    const readonlyAcct = Keypair.generate().publicKey;
    const writableAcct = Keypair.generate().publicKey;
    const readonlySigner = Keypair.generate().publicKey;
    const writableSigner = Keypair.generate().publicKey;

    const ix = kitInstructionToWeb3({
      programAddress: program.toBase58(),
      accounts: [
        { address: readonlyAcct.toBase58(), role: 0 }, // READONLY
        { address: writableAcct.toBase58(), role: 1 }, // WRITABLE
        { address: readonlySigner.toBase58(), role: 2 }, // READONLY_SIGNER
        { address: writableSigner.toBase58(), role: 3 }, // WRITABLE_SIGNER
      ],
      data: new Uint8Array([1, 2, 3, 4]),
    });

    expect(ix.programId.equals(program)).toBe(true);
    expect(ix.keys).toHaveLength(4);
    expect(ix.keys[0]).toMatchObject({ isSigner: false, isWritable: false });
    expect(ix.keys[1]).toMatchObject({ isSigner: false, isWritable: true });
    expect(ix.keys[2]).toMatchObject({ isSigner: true, isWritable: false });
    expect(ix.keys[3]).toMatchObject({ isSigner: true, isWritable: true });
    expect(ix.keys[0].pubkey.equals(readonlyAcct)).toBe(true);
    expect([...ix.data]).toEqual([1, 2, 3, 4]);
  });

  it('handles missing accounts and data', () => {
    const program = Keypair.generate().publicKey;
    const ix = kitInstructionToWeb3({ programAddress: program.toBase58() });
    expect(ix.keys).toHaveLength(0);
    expect(ix.data).toHaveLength(0);
  });
});

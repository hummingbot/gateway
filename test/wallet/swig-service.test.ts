import { Keypair, PublicKey } from '@solana/web3.js';

import { getSwigService } from '../../src/wallet/swig/swig-service';

const SWIG_PROGRAM = 'swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB';

describe('SwigService', () => {
  const service = getSwigService();

  it('exposes the deployed Swig program id', () => {
    expect(service.programId.toBase58()).toBe(SWIG_PROGRAM);
  });

  it('builds a create instruction targeting the Swig program with a 32-byte id', async () => {
    const owner = Keypair.generate().publicKey;
    const { id, accountAddress, createInstruction } = await service.buildCreateInstruction({
      payer: owner,
      ownerPublicKey: owner,
    });
    expect(id).toBeInstanceOf(Uint8Array);
    expect(id.length).toBe(32);
    expect(accountAddress).toBeInstanceOf(PublicKey);
    expect(createInstruction.programId.toBase58()).toBe(SWIG_PROGRAM);
  });

  it('produces distinct ids and account addresses across calls', async () => {
    const owner = Keypair.generate().publicKey;
    const a = await service.buildCreateInstruction({ payer: owner, ownerPublicKey: owner });
    const b = await service.buildCreateInstruction({ payer: owner, ownerPublicKey: owner });
    expect(Buffer.from(a.id).toString('hex')).not.toBe(Buffer.from(b.id).toString('hex'));
    expect(a.accountAddress.equals(b.accountAddress)).toBe(false);
  });

  it('requireRole throws a clear error when no matching role exists', () => {
    const fakeSwig: any = { findRolesByEd25519SignerPk: () => [] };
    const signer = Keypair.generate().publicKey;
    expect(() => service.requireRole(fakeSwig, signer, 'delegate')).toThrow(/No delegate role found/);
  });

  it('requireRole returns the first matching role', () => {
    const role = { id: 7 };
    const fakeSwig: any = { findRolesByEd25519SignerPk: () => [role] };
    const signer = Keypair.generate().publicKey;
    expect(service.requireRole(fakeSwig, signer, 'delegate')).toBe(role);
  });
});

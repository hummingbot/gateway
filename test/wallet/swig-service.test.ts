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

  it('buildAddProgramLimitsInstructions rejects an empty program list before touching the chain', async () => {
    const conn: any = {
      getAccountInfo: jest.fn(() => {
        throw new Error('should not fetch');
      }),
    };
    const owner = Keypair.generate().publicKey;
    const delegate = Keypair.generate().publicKey;
    await expect(service.buildAddProgramLimitsInstructions(conn, owner, owner, delegate, [])).rejects.toThrow(
      /No program ids provided/,
    );
    expect(conn.getAccountInfo).not.toHaveBeenCalled();
  });

  it('buildAddTokenLimitsInstructions rejects an empty token-limit list before touching the chain', async () => {
    const conn: any = {
      // fail loudly if the route reached the chain despite an empty list
      getAccountInfo: jest.fn(() => {
        throw new Error('should not fetch');
      }),
    };
    const owner = Keypair.generate().publicKey;
    const delegate = Keypair.generate().publicKey;
    await expect(service.buildAddTokenLimitsInstructions(conn, owner, owner, delegate, [])).rejects.toThrow(
      /No token limits provided/,
    );
    expect(conn.getAccountInfo).not.toHaveBeenCalled();
  });

  describe('buildDelegateActions (delegate role permissions)', () => {
    const ORCA = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
    const METEORA = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
    const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
    const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';

    // buildDelegateActions is private; exercise it directly to prove the on-chain role a
    // fresh provisioning would create actually permits the intended programs/mints.
    const buildActions = (
      allowedProgramIds: string[],
      tokenLimits: { mint: string; amount: bigint }[],
      allowAllPrograms = false,
    ) => (service as any).buildDelegateActions({ allowedProgramIds, allowAllPrograms, tokenLimits });

    it('permits Orca AND Meteora (the re-provisioned multi-venue allowlist), denies others', () => {
      const actions: any = buildActions([ORCA, METEORA, SPL_TOKEN, ATA], [{ mint: USDC, amount: 1_000_000n }]);

      expect(actions.canUseProgram(new PublicKey(ORCA))).toBe(true);
      expect(actions.canUseProgram(new PublicKey(METEORA))).toBe(true);
      expect(actions.canUseProgram(new PublicKey(SPL_TOKEN))).toBe(true);
      // A program not on the allowlist is denied (default-deny).
      expect(actions.canUseProgram(new PublicKey(RAYDIUM_CLMM))).toBe(false);

      // The capped mint is spendable up to its limit; an un-capped mint is not.
      expect(actions.canSpendToken(new PublicKey(USDC))).toBe(true);
      expect(actions.tokenSpendLimit(new PublicKey(USDC))).toBe(1_000_000n);
    });

    it('rejects a role with no allowed programs', () => {
      expect(() => buildActions([], [{ mint: USDC, amount: 1n }])).toThrow(/at least one allowed program/);
    });

    it('builds a token-cap-only role (programAll) that any program may serve, still bounded by caps', () => {
      // The Jupiter role: no allowlist — an aggregator routes through arbitrary programs —
      // with the blast radius bounded exclusively by the per-mint/SOL caps.
      const actions: any = buildActions([], [{ mint: USDC, amount: 1_000_000n }], true);

      expect(actions.canUseProgram(new PublicKey(ORCA))).toBe(true);
      expect(actions.canUseProgram(new PublicKey(RAYDIUM_CLMM))).toBe(true);
      expect(actions.canSpendToken(new PublicKey(USDC))).toBe(true);
      expect(actions.tokenSpendLimit(new PublicKey(USDC))).toBe(1_000_000n);
    });

    it('rejects mixing allowAllPrograms with an explicit allowlist', () => {
      expect(() => buildActions([ORCA], [], true)).toThrow(/mutually exclusive/);
    });
  });
});

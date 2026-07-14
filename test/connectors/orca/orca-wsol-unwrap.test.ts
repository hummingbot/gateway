/**
 * Unit tests for handleWsolAta's 'unwrap' mode Swig guard.
 *
 * The Swig program snapshots wallet token accounts that exist when a wrapped transaction
 * starts and re-hashes them post-CPI; closing a snapshotted account crashes the on-chain
 * program. So for Swig wallets the WSOL close must be skipped when the ATA pre-exists,
 * while a WSOL account created inside the same transaction (no pre-existing account info)
 * still closes normally.
 */

import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';

import { handleWsolAta } from '../../../src/connectors/orca/orca.utils';

const WALLET = Keypair.generate().publicKey;
const WSOL_ATA = Keypair.generate().publicKey;
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

function fakeClient(ataInfo: object | null) {
  return {
    getContext: () => ({
      connection: { getAccountInfo: jest.fn(async () => ataInfo) },
      wallet: { publicKey: WALLET },
    }),
  } as any;
}

function fakeSolana(isSwig: boolean) {
  return {
    isSwigWallet: jest.fn(async () => isSwig),
    unwrapSOL: jest.fn(() => new TransactionInstruction({ programId: TOKEN_PROGRAM, keys: [], data: Buffer.alloc(0) })),
  } as any;
}

describe('handleWsolAta unwrap mode', () => {
  it('skips the WSOL close for a Swig wallet when the ATA pre-exists (Swig program would panic)', async () => {
    const builder = { addInstruction: jest.fn() } as any;
    const solana = fakeSolana(true);

    await handleWsolAta(
      builder,
      fakeClient({ lamports: 1 }),
      NATIVE_MINT,
      WSOL_ATA,
      TOKEN_PROGRAM,
      'unwrap',
      undefined,
      solana,
    );

    expect(builder.addInstruction).not.toHaveBeenCalled();
    expect(solana.unwrapSOL).not.toHaveBeenCalled();
  });

  it('still closes a WSOL account created inside the same transaction for a Swig wallet', async () => {
    const builder = { addInstruction: jest.fn() } as any;
    const solana = fakeSolana(true);

    // No pre-existing account on chain: the ATA is created by an earlier instruction in
    // this same transaction, so it is not snapshotted and closing it is safe.
    await handleWsolAta(builder, fakeClient(null), NATIVE_MINT, WSOL_ATA, TOKEN_PROGRAM, 'unwrap', undefined, solana);

    expect(solana.unwrapSOL).toHaveBeenCalledWith(WALLET, TOKEN_PROGRAM);
    expect(builder.addInstruction).toHaveBeenCalledTimes(1);
  });

  it('unwraps normally for non-Swig wallets even when the ATA pre-exists', async () => {
    const builder = { addInstruction: jest.fn() } as any;
    const solana = fakeSolana(false);

    await handleWsolAta(
      builder,
      fakeClient({ lamports: 1 }),
      NATIVE_MINT,
      WSOL_ATA,
      TOKEN_PROGRAM,
      'unwrap',
      undefined,
      solana,
    );

    expect(solana.unwrapSOL).toHaveBeenCalledWith(WALLET, TOKEN_PROGRAM);
    expect(builder.addInstruction).toHaveBeenCalledTimes(1);
  });
});

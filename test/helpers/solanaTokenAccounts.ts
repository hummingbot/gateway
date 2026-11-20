import { AccountLayout } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';

/** A token account as getTokenAccountsByOwner returns it: AccountLayout bytes, owned by `programId`. */
export function encodedTokenAccount(owner: PublicKey, mint: PublicKey, amount: bigint, programId: PublicKey) {
  const data = new Uint8Array(AccountLayout.span);
  AccountLayout.encode(
    {
      mint,
      owner,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  return {
    pubkey: Keypair.generate().publicKey,
    account: { data: Buffer.from(data), owner: programId, lamports: 1, executable: false },
  };
}

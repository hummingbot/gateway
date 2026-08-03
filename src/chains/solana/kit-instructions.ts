/**
 * Convert @solana/kit instructions to @solana/web3.js TransactionInstructions.
 *
 * Kit-native connectors (Orca v4) produce kit `Instruction` objects, but Gateway's
 * signing path (Solana.sendAndConfirmTransactionForWallet) operates on
 * `@solana/web3.js` transactions. This adapter bridges the two.
 */

import { PublicKey, TransactionInstruction } from '@solana/web3.js';

// Kit's AccountRole enum (see @solana/instructions): the low bit is "writable",
// the next bit is "signer".
const ROLE_WRITABLE = 0b01;
const ROLE_SIGNER = 0b10;

interface KitAccountMeta {
  address: string | { toString(): string };
  role: number;
}

interface KitInstruction {
  programAddress: string | { toString(): string };
  accounts?: readonly KitAccountMeta[];
  // Kit uses a ReadonlyUint8Array; ArrayLike<number> accepts that and a plain Uint8Array.
  data?: ArrayLike<number>;
}

function toPublicKey(value: string | { toString(): string }): PublicKey {
  return new PublicKey(typeof value === 'string' ? value : value.toString());
}

export function kitInstructionToWeb3(instruction: KitInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: toPublicKey(instruction.programAddress),
    keys: (instruction.accounts ?? []).map((account) => ({
      pubkey: toPublicKey(account.address),
      isSigner: (account.role & ROLE_SIGNER) !== 0,
      isWritable: (account.role & ROLE_WRITABLE) !== 0,
    })),
    data: Buffer.from(Uint8Array.from(instruction.data ?? [])),
  });
}

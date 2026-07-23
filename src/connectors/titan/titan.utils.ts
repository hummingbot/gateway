import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

/**
 * Instruction shape returned by the Titan DART swap API
 */
export interface TitanApiInstruction {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string; // base64-encoded
}

/**
 * Converts Titan DART API instructions (base58 keys, base64 data) into web3.js
 * TransactionInstruction objects.
 */
export function deserializeInstructions(rawInstructions: TitanApiInstruction[]): TransactionInstruction[] {
  return rawInstructions.map((instruction) => {
    if (!instruction.programId || !instruction.data || !Array.isArray(instruction.accounts)) {
      throw new Error(`Malformed Titan instruction: ${JSON.stringify(instruction).slice(0, 200)}`);
    }
    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map((account) => ({
        pubkey: new PublicKey(account.pubkey),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
      data: Buffer.from(instruction.data, 'base64'),
    });
  });
}

/**
 * Drops repeated ComputeBudget instructions of the same type (first data byte is the
 * instruction discriminator), keeping the first occurrence. The Titan DART API has been
 * observed returning a duplicated RequestHeapFrame instruction, which the Solana runtime
 * rejects with 'Transaction contains a duplicate instruction that is not allowed'.
 */
export function dedupeComputeBudgetInstructions(instructions: TransactionInstruction[]): TransactionInstruction[] {
  const seenDiscriminators = new Set<number>();
  return instructions.filter((instruction) => {
    if (!instruction.programId.equals(ComputeBudgetProgram.programId)) {
      return true;
    }
    const discriminator = instruction.data[0];
    if (seenDiscriminators.has(discriminator)) {
      return false;
    }
    seenDiscriminators.add(discriminator);
    return true;
  });
}

/**
 * Resolves address lookup table accounts by address, throwing a clear error when
 * any table cannot be found on-chain.
 */
export async function resolveAddressLookupTables(
  connection: Connection,
  altAddresses: string[],
): Promise<AddressLookupTableAccount[]> {
  return await Promise.all(
    altAddresses.map(async (address) => {
      const result = await connection.getAddressLookupTable(new PublicKey(address));
      if (!result.value) {
        throw new Error(`Address lookup table not found: ${address}`);
      }
      return result.value;
    }),
  );
}

/**
 * Compiles an UNSIGNED V0 VersionedTransaction from raw instructions and address lookup
 * tables, using a fresh blockhash. Signing/simulation happen in the wallet-type-aware
 * chokepoint (Solana.sendAndConfirmTransactionForWallet).
 */
export async function buildVersionedTransactionFromInstructions(
  connection: Connection,
  payerAddress: string,
  rawInstructions: TitanApiInstruction[],
  altAddresses: string[],
): Promise<VersionedTransaction> {
  if (!rawInstructions || rawInstructions.length === 0) {
    throw new Error('No instructions provided to build the transaction');
  }

  const instructions = dedupeComputeBudgetInstructions(deserializeInstructions(rawInstructions));
  const lookupTables = await resolveAddressLookupTables(connection, altAddresses ?? []);
  const { blockhash } = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: new PublicKey(payerAddress),
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTables);

  return new VersionedTransaction(messageV0);
}

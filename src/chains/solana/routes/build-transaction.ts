/**
 * The generic half of the stateless build flow (#682): build an unsigned transaction
 * from caller-supplied instructions — operations Gateway has no connector for, such as
 * a client's own on-chain program.
 *
 * Implementation is deliberately thin: an empty transaction goes through the same
 * capture path the /trading build-* routes use, with the caller's instructions carried
 * as the build context's extra instructions. That reuses, in one audited place, the
 * whole preparation pipeline — instruction parsing and the wallet-only-signer rule,
 * preflight simulation, compute-budget sizing, priority fee, fresh blockhash, empty
 * fee-payer slot — and the identical BuildTransactionResponse contract, so the result
 * signs and submits exactly like any connector-built transaction.
 */
import { PublicKey, Transaction } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

import { BuildInstructionType, BuildTransactionResponseType } from '../../../schemas/build-schema';
import { httpErrors } from '../../../services/error-handler';
import { Solana } from '../solana';
import { captureUnsignedTransaction } from '../solana-build-mode';
import { TransactionPriority } from '../solana-priority-fees';

export async function buildSolanaTransaction(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  instructions: BuildInstructionType[],
  minComputeUnits?: number,
  references?: string[],
  shape: { feePayer?: string; memo?: string; priority?: TransactionPriority } = {},
): Promise<BuildTransactionResponseType> {
  const solana = await Solana.getInstance(network);

  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest(`Invalid Solana address: ${walletAddress}`);
  }

  // The capture path refreshes the blockhash again before serializing; this one only
  // makes the empty transaction simulatable (simulation needs a compilable message).
  const { blockhash } = await solana.connection.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletPk;

  return captureUnsignedTransaction(
    { extraInstructions: instructions, references, feePayer: shape.feePayer, memo: shape.memo },
    () => solana.sendAndConfirmTransactionForWallet(tx, walletAddress),
    minComputeUnits,
    shape.priority,
  );
}

/**
 * The submit half of the stateless build/sign/submit flow (#682): accept a transaction
 * the caller signed with its own wallet, re-merge the ephemeral signatures the build
 * step returned, verify every signature locally, and broadcast.
 *
 * Local verification matters because the broadcast path uses skipPreflight: a
 * transaction whose message was mutated after build (so the ephemeral signatures no
 * longer verify) would be silently dropped by the network and poll forever as PENDING.
 * Verifying here turns that mistake into an immediate, explicit 400.

 */
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';
import nacl from 'tweetnacl';

import { SubmitResponseType, TransactionStatusCode } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

interface ExtraSigner {
  pubkey: string;
  signature: string;
}

function deserialize(signedTransaction: string): Transaction | VersionedTransaction {
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(Buffer.from(signedTransaction, 'base64'));
  } catch {
    throw httpErrors.badRequest('signedTransaction is not valid base64');
  }
  try {
    return VersionedTransaction.deserialize(raw);
  } catch {
    // Not a versioned transaction; fall through to the legacy wire format.
  }
  try {
    return Transaction.from(raw);
  } catch (e: any) {
    throw httpErrors.badRequest(`signedTransaction could not be deserialized: ${e.message}`);
  }
}

/**
 * Re-apply the build step's ephemeral signatures. A signing wallet may have dropped
 * them (some wallet adapters re-serialize with only their own signature), so the
 * merge restores them rather than trusting the wallet to have preserved them.
 */
function mergeExtraSigners(tx: Transaction | VersionedTransaction, extraSigners: ExtraSigner[]): void {
  for (const [index, signer] of extraSigners.entries()) {
    let pubkey: PublicKey;
    let signature: Buffer;
    try {
      pubkey = new PublicKey(signer.pubkey);
      signature = Buffer.from(signer.signature, 'base64');
    } catch (e: any) {
      throw httpErrors.badRequest(`extraSigners[${index}] is malformed: ${e.message}`);
    }
    try {
      if (tx instanceof VersionedTransaction) {
        tx.addSignature(pubkey, new Uint8Array(signature));
      } else {
        tx.addSignature(pubkey, signature);
      }
    } catch (e: any) {
      // addSignature throws when the pubkey is not a required signer of this message —
      // which means the transaction is not the one this build produced.
      throw httpErrors.badRequest(
        `extraSigners[${index}] (${signer.pubkey}) is not a required signer of this transaction: ${e.message}. ` +
          'Pass the extraSigners from the same build response as the transaction.',
      );
    }
  }
}

const MUTATION_HINT =
  'The message differs from what was signed — it was mutated after build (or after the wallet signed). ' +
  'Sign the built transaction as-is and pass it back unchanged.';

/** Verify every required signature over the exact message bytes, before broadcast. */
function verifySignatures(tx: Transaction | VersionedTransaction): void {
  if (tx instanceof VersionedTransaction) {
    const message = new Uint8Array(tx.message.serialize());
    const required = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
    required.forEach((key, i) => {
      const signature = tx.signatures[i];
      if (!signature || signature.every((b) => b === 0)) {
        throw httpErrors.badRequest(
          `Transaction is missing the signature for ${key.toBase58()}` +
            (i === 0 ? ' (the fee-payer wallet). Sign the transaction before submitting.' : '.'),
        );
      }
      if (!nacl.sign.detached.verify(message, signature, key.toBytes())) {
        throw httpErrors.badRequest(`Signature for ${key.toBase58()} does not verify. ${MUTATION_HINT}`);
      }
    });
    return;
  }

  const missing = tx.signatures.find((s) => s.signature === null);
  if (missing) {
    throw httpErrors.badRequest(
      `Transaction is missing the signature for ${missing.publicKey.toBase58()}. ` +
        'Sign the transaction before submitting.',
    );
  }
  if (!tx.verifySignatures()) {
    throw httpErrors.badRequest(`A signature on the transaction does not verify. ${MUTATION_HINT}`);
  }
}

/**
 * A transaction is only accepted while its recent blockhash is — about a
 * minute after it was built. Signed later (a wallet prompt left open, a sign
 * card read slowly), it would be broadcast and never land, and the caller
 * would wait out a timeout that says nothing. Checked first, it is refused
 * with the reason, and nothing is sent.
 */
async function assertBlockhashValid(solana: Solana, tx: Transaction | VersionedTransaction): Promise<void> {
  const blockhash = tx instanceof VersionedTransaction ? tx.message.recentBlockhash : tx.recentBlockhash;
  if (!blockhash) throw httpErrors.badRequest('The transaction has no recent blockhash');
  const { value } = await solana.connection.isBlockhashValid(blockhash, { commitment: 'processed' });
  if (!value) {
    throw httpErrors.badRequest(
      'The transaction expired before it was sent: Solana accepts one for about a minute ' +
        'after it is built. Nothing was sent; build and sign it again.',
    );
  }
}

export async function submitSolanaTransaction(
  _fastify: FastifyInstance,
  network: string,
  signedTransaction: string,
  extraSigners: ExtraSigner[] = [],
): Promise<SubmitResponseType> {
  const solana = await Solana.getInstance(network);

  const tx = deserialize(signedTransaction);
  mergeExtraSigners(tx, extraSigners);
  verifySignatures(tx);
  await assertBlockhashValid(solana, tx);
  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(tx);

  if (!signature) {
    throw httpErrors.internalServerError('Transaction failed to send');
  }

  if (confirmed && txData) {
    const fee = (txData.meta?.fee ?? 0) / 1e9;
    logger.info(`Submitted transaction ${signature} confirmed with fee ${fee} SOL`);
    return { signature, status: TransactionStatusCode.CONFIRMED, fee };
  }

  // Landed-but-failed surfaces the parsed program error; otherwise the transaction is
  // still in flight (or expired) and the caller tracks it with /chains/solana/poll.
  await solana.throwIfLandedWithError(signature);
  logger.info(`Submitted transaction ${signature} not yet confirmed; caller should poll`);
  return { signature, status: TransactionStatusCode.PENDING, fee: null };
}

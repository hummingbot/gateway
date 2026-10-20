/**
 * POST /chains/ethereum/submit: broadcast a transaction a build-* route built and the
 * caller signed (#682). Answers like the Solana submit: confirmed with its fee, or
 * broadcast but not yet confirmed (track it with /chains/ethereum/poll).
 */
import { Transaction, utils } from 'ethers';
import { FastifyInstance } from 'fastify';

import { SubmitResponseType, TransactionStatusCode } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';

/** The signed transaction, parsed, or a 400 that says what is wrong with it. */
function parseSigned(signedTransaction: string): Transaction {
  if (!utils.isHexString(signedTransaction)) {
    throw httpErrors.badRequest('signedTransaction must be the signed raw transaction as 0x-hex');
  }
  let tx: Transaction;
  try {
    tx = utils.parseTransaction(signedTransaction);
  } catch (e: any) {
    throw httpErrors.badRequest(`signedTransaction is not a valid signed EVM transaction: ${e.message}`);
  }
  if (!tx.from || !tx.hash) {
    throw httpErrors.badRequest('signedTransaction carries no signature. Sign the transaction before submitting.');
  }
  return tx;
}

export async function submitEthereumTransaction(
  _fastify: FastifyInstance,
  network: string,
  signedTransaction: string,
  extraSigners?: { pubkey: string; signature: string }[],
): Promise<SubmitResponseType> {
  if (extraSigners && extraSigners.length > 0) {
    throw httpErrors.badRequest('extraSigners applies to Solana transactions only; an EVM transaction has none.');
  }
  const ethereum = await Ethereum.getInstance(network);
  const tx = parseSigned(signedTransaction);
  if (tx.chainId !== ethereum.chainId) {
    throw httpErrors.badRequest(
      `The transaction is signed for chain id ${tx.chainId}, but ${network} is chain id ${ethereum.chainId}. ` +
        'Nothing was sent.',
    );
  }

  const response = await ethereum.broadcastSignedTransaction(signedTransaction);
  logger.info(`Submitted transaction ${response.hash} from ${tx.from} (nonce ${tx.nonce})`);

  // A revert throws the shared 400 TRANSACTION_FAILED; still pending after the extended
  // poll comes back unconfirmed, for the caller to track with /chains/ethereum/poll.
  const outcome = await ethereum.handleTransactionConfirmation(response);
  if (!outcome.confirmed) {
    logger.info(`Submitted transaction ${outcome.signature} not yet confirmed; caller should poll`);
    return { signature: outcome.signature, status: TransactionStatusCode.PENDING, fee: null };
  }
  return { signature: outcome.signature, status: TransactionStatusCode.CONFIRMED, fee: outcome.fee };
}

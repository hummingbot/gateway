import { PublicKey } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';

import { TransactionsResponseType } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';
import { walletActivity } from '../solana-activity';

/** A wallet's recent transactions, each named as what it did (see solana-activity). */
export async function getSolanaTransactions(
  fastify: FastifyInstance,
  network: string,
  address: string,
  limit: number,
  before?: string,
  includeOther?: boolean,
): Promise<TransactionsResponseType> {
  // The venue tables in solana-activity hold mainnet program ids. On another cluster
  // the venues deploy elsewhere, and every venue call would be misread as a transfer.
  if (network !== 'mainnet-beta') {
    throw fastify.httpErrors.badRequest(
      `Transaction parsing knows mainnet-beta program ids only; ${network} is not supported`,
    );
  }
  try {
    new PublicKey(address);
  } catch {
    throw fastify.httpErrors.badRequest(`Invalid Solana address: ${address}`);
  }
  try {
    const solana = await Solana.getInstance(network);
    const page = await walletActivity(
      solana.connection,
      address,
      { limit, before, includeOther },
      async (mint) => (await solana.getToken(mint))?.symbol ?? null,
    );
    return { network, ...page };
  } catch (error) {
    logger.error(`Error reading transactions for ${address}: ${error.message}`);
    // A caller's error (a 4xx) and a rate limit (429) pass through as they are.
    if (error.statusCode && error.statusCode < 500) throw error;
    throw fastify.httpErrors.internalServerError(`Failed to read transactions: ${error.message}`);
  }
}

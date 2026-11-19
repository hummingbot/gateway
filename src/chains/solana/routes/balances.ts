import { FastifyInstance } from 'fastify';

import { BalanceResponseType } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

/**
 * Main entry point for getting Solana balances
 * Only returns balances for tokens in the network's token list
 */
export async function getSolanaBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
): Promise<BalanceResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const balances = await solana.getBalances(address, tokens);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);

    // A caller's error (a 4xx, such as a malformed address) and a rate limit (429) pass
    // through as they are; only an unexpected failure becomes a 500.
    if (error.statusCode && error.statusCode < 500) {
      throw error;
    }

    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

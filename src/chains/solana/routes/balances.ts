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

    // Re-throw rate limit errors (statusCode 429) without wrapping
    if (error.statusCode === 429) {
      throw error;
    }

    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

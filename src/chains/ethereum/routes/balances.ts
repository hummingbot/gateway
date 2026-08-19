import { FastifyInstance } from 'fastify';

import { BalanceResponseType } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';

export async function getEthereumBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
): Promise<BalanceResponseType> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    const balances = await ethereum.getBalances(address, tokens);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);
    if (error.statusCode === 429) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

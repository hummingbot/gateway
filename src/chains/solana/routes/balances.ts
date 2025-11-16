import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { BalanceRequestType, BalanceResponseType, BalanceResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaBalanceRequest } from '../schemas';
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

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description:
          "Get token balances for a Solana address. Only returns tokens in the network's token list. If no tokens specified or empty array provided, returns non-zero balances for tokens from the token list that are found in the wallet (includes SOL even if zero). If specific tokens are requested, returns those exact tokens with their balances, including zeros.",
        tags: ['/chain/solana'],
        body: SolanaBalanceRequest,
        response: {
          200: {
            ...BalanceResponseSchema,
            description: 'Token balances for the specified address (only tokens in token list)',
            examples: [
              {
                balances: {
                  SOL: 1.5,
                  USDC: 100.0,
                  BONK: 50000.0,
                },
              },
            ],
          },
        },
      },
    },
    async (request) => {
      const { network, address, tokens } = request.body;
      return await getSolanaBalances(fastify, network, address, tokens);
    },
  );
};

export default balancesRoute;

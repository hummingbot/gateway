import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { BalanceResponseType, BalanceResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';

export type WalletBalanceRequestType = Static<typeof WalletBalanceRequestSchema>;

export const WalletBalanceRequestSchema = Type.Object({
  network: Type.Optional(Type.String()),
  address: Type.Optional(Type.String()),
  tokens: Type.Optional(
    Type.Array(Type.String(), {
      description: 'a list of token symbols or addresses',
    }),
  ),
  fetchAll: Type.Optional(
    Type.Boolean({
      description: 'fetch all tokens in wallet, not just those in token list (default: false)',
    }),
  ),
});

export async function getWalletBalances(
  fastify: any,
  network: string,
  address: string,
  tokens?: string[],
): Promise<BalanceResponseType> {
  try {
    // Use Ethereum implementation pointed at the specified network (works for BSC, Ethereum, etc.)
    const ethereum = await Ethereum.getInstance(network);
    const balances = await ethereum.getBalances(address, tokens);
    return { balances };
  } catch (error: any) {
    logger.error(`Error getting wallet balances on ${network}: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

export const walletBalancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/balances',
    {
      schema: {
        description:
          'Get wallet balances on any network (BSC, Ethereum, etc.). If no tokens specified or empty array provided, returns native token and only non-zero balances for tokens from the token list. If specific tokens are requested, returns those exact tokens with their balances, including zeros.',
        tags: ['/wallet'],
        body: WalletBalanceRequestSchema,
        response: {
          200: BalanceResponseSchema,
        },
      },
    },
    async (request: any) => {
      const { network, address, tokens } = request.body;
      return await getWalletBalances(fastify, network || '', address || '', tokens);
    },
  );
};

export default walletBalancesRoute;

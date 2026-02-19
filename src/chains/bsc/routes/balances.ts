import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

// type FastifyRequest = import('fastify').FastifyRequest;
import { BalanceResponseType, BalanceResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum } from '../../ethereum/ethereum';

export type BscBalanceRequestType = Static<typeof BscBalanceRequestSchema>;

export const BscBalanceRequestSchema = Type.Object({
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

export async function getBscBalances(fastify: any, address: string, tokens?: string[]): Promise<BalanceResponseType> {
  try {
    // Use Ethereum implementation pointed at the BSC network
    const ethereum = await Ethereum.getInstance('bsc');
    const balances = await ethereum.getBalances(address, tokens);
    return { balances };
  } catch (error: any) {
    logger.error(`Error getting BSC balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/balances',
    {
      schema: {
        description:
          'Get BSC balances. If no tokens specified or empty array provided, returns native token (BNB) and only non-zero balances for tokens from the token list. If specific tokens are requested, returns those exact tokens with their balances, including zeros.',
        tags: ['/chain/bsc'],
        body: BscBalanceRequestSchema,
        response: {
          200: BalanceResponseSchema,
        },
      },
    },
    async (request: any) => {
      const { address, tokens } = request.body;
      // Force BSC as the network
      return await getBscBalances(fastify, address || '', tokens);
    },
  );
};

export default balancesRoute;

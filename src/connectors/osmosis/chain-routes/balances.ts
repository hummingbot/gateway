import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  BalanceRequestType,
  BalanceResponseType,
  BalanceRequestSchema,
  BalanceResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function getOsmosisBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
  fetchAll?: boolean,
): Promise<BalanceResponseType> {
  try {
    if (fetchAll) {
      tokens = [];
    }
    const osmosis = await Osmosis.getInstance(network);
    await osmosis.init();
    const send_tokens = tokens ? tokens : [];
    const balances = await osmosis.controller.balances(osmosis, {
      address: address,
      tokenSymbols: send_tokens,
    });

    if (!Object.keys(balances).length) {
      throw fastify.httpErrors.badRequest('No token balances found for the given wallet');
    }

    return balances;
  } catch (error) {
    if (error.statusCode) {
      throw error; // Re-throw if it's already a Fastify error
    }
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description:
          'Get Cosmos balances. If no tokens specified or empty array provided, returns native token (OSMO) and only non-zero balances for tokens from the token list. If specific tokens are requested, returns those exact tokens with their balances, including zeros.',
        tags: ['/chain/cosmos'],
        body: {
          ...BalanceRequestSchema,
          properties: {
            ...BalanceRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'testnet'],
            },
            address: { type: 'string', examples: [walletAddressExample] },
            tokens: {
              type: 'array',
              items: { type: 'string' },
              description:
                'A list of token symbols or addresses. An empty array is treated the same as if the parameter was not provided, returning only non-zero balances plus the native token.',
              examples: [['ATOM', 'OSMO']],
            },
          },
        },
        response: {
          200: BalanceResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, tokens, fetchAll } = request.body;
      return await getOsmosisBalances(fastify, network, address, tokens, fetchAll);
    },
  );
};

export default balancesRoute;

import { FastifyPluginAsync } from 'fastify';

import { WalletBalanceRequestSchema, WalletBalanceResponseSchema, WalletBalanceRequest } from '../schemas';
import { getWalletBalance } from '../utils';

export const walletBalanceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: WalletBalanceRequest }>(
    '/balance',
    {
      schema: {
        description: 'Get token balances for a wallet address on a given chain/network',
        tags: ['wallet'],
        body: WalletBalanceRequestSchema,
        response: {
          200: WalletBalanceResponseSchema,
        },
      },
    },
    async (request) => {
      return await getWalletBalance(fastify, request.body);
    },
  );
};

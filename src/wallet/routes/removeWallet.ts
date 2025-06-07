import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { RemoveWalletRequest, RemoveWalletRequestSchema } from '../schemas';
import { removeWallet } from '../utils';

export const removeWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Body: RemoveWalletRequest }>(
    '/remove',
    {
      schema: {
        description: 'Remove a wallet by its address',
        tags: ['wallet'],
        body: {
          ...RemoveWalletRequestSchema,
          examples: [
            {
              chain: 'solana',
              address: '<address>',
            },
          ],
        },
        response: {
          200: {
            type: 'null',
          },
        },
      },
    },
    async (request) => {
      logger.info(
        `Removing wallet: ${request.body.address} from chain: ${request.body.chain}`,
      );
      await removeWallet(fastify, request.body);
      return null;
    },
  );
};

export default removeWalletRoute;

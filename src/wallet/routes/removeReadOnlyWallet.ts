import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  RemoveReadOnlyWalletRequest,
  RemoveReadOnlyWalletResponse,
  RemoveReadOnlyWalletRequestSchema,
  RemoveReadOnlyWalletResponseSchema,
} from '../schemas';
import { removeReadOnlyWallet } from '../utils';

export const removeReadOnlyWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{
    Body: RemoveReadOnlyWalletRequest;
    Reply: RemoveReadOnlyWalletResponse;
  }>(
    '/remove-read-only',
    {
      schema: {
        description: 'Remove a read-only wallet address',
        tags: ['wallet'],
        body: RemoveReadOnlyWalletRequestSchema,
        response: {
          200: RemoveReadOnlyWalletResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(
        `Removing read-only wallet for chain: ${request.body.chain}, address: ${request.body.address}`,
      );
      return await removeReadOnlyWallet(fastify, request.body);
    },
  );
};

export default removeReadOnlyWalletRoute;
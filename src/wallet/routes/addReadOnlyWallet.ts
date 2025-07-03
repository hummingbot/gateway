import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  AddReadOnlyWalletRequest,
  AddReadOnlyWalletResponse,
  AddReadOnlyWalletRequestSchema,
  AddReadOnlyWalletResponseSchema,
} from '../schemas';
import { addReadOnlyWallet } from '../utils';

export const addReadOnlyWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddReadOnlyWalletRequest;
    Reply: AddReadOnlyWalletResponse;
  }>(
    '/add-read-only',
    {
      schema: {
        description: 'Add a read-only wallet address for monitoring',
        tags: ['/wallet'],
        body: AddReadOnlyWalletRequestSchema,
        response: {
          200: AddReadOnlyWalletResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(
        `Adding read-only wallet for chain: ${request.body.chain}, address: ${request.body.address}`,
      );
      return await addReadOnlyWallet(fastify, request.body);
    },
  );
};

export default addReadOnlyWalletRoute;

import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  CreateWalletRequest,
  CreateWalletResponse,
  CreateWalletRequestSchema,
  CreateWalletResponseSchema,
} from '../schemas';
import { createWallet } from '../utils';

export const createWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateWalletRequest; Reply: CreateWalletResponse }>(
    '/create',
    {
      schema: {
        description: 'Create a new wallet and add it to Gateway',
        tags: ['/wallet'],
        body: {
          ...CreateWalletRequestSchema,
          examples: [
            {
              chain: 'solana',
              setDefault: true,
            },
          ],
        },
        response: {
          200: CreateWalletResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(`Creating new wallet for chain: ${request.body.chain}`);
      return await createWallet(fastify, request.body);
    },
  );
};

export default createWalletRoute;

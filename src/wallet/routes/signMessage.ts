import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  SignMessageRequest,
  SignMessageResponse,
  SignMessageRequestSchema,
  SignMessageResponseSchema,
} from '../schemas';
import { signMessage } from '../utils';

export const signMessageRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SignMessageRequest; Reply: SignMessageResponse }>(
    '/sign',
    {
      schema: {
        description: 'Sign a message with a specific wallet',
        tags: ['wallet'],
        body: {
          ...SignMessageRequestSchema,
          examples: [
            {
              chain: 'solana',
              network: 'mainnet-beta',
              address: '<address>',
              message: 'Hello, World!',
            },
          ],
        },
        response: {
          200: SignMessageResponseSchema,
        },
      },
    },
    async (request) => {
      logger.info(
        `Signing message for wallet: ${request.body.address} on chain: ${request.body.chain}`,
      );
      return await signMessage(fastify, request.body);
    },
  );
};

export default signMessageRoute;

import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import {
  AddExternalWalletRequest,
  AddExternalWalletRequestSchema,
  AddExternalWalletResponse,
  AddExternalWalletResponseSchema,
} from '../schemas';
import { addExternalWallet } from '../utils';

export const addExternalWalletRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AddExternalWalletRequest; Reply: AddExternalWalletResponse }>(
    '/add-external',
    {
      schema: {
        description:
          'Add an external wallet: an address with no key in Gateway. Its execute requests are refused; build ' +
          'with the build-* routes, sign outside Gateway, and send with POST /chains/{chain}/submit.',
        tags: ['/wallet'],
        body: {
          ...AddExternalWalletRequestSchema,
          examples: [{ chain: 'solana', address: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMoDUi' }],
        },
        response: {
          200: AddExternalWalletResponseSchema,
        },
      },
    },
    async (request) => {
      const { chain, address, setDefault } = request.body;
      logger.info(`Adding external wallet ${address} for chain: ${chain}`);
      return await addExternalWallet(fastify, chain, address, setDefault);
    },
  );
};

export default addExternalWalletRoute;

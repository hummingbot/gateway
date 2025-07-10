import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { GetWalletsQuery, GetWalletResponse, GetWalletResponseSchema, GetWalletsQuerySchema } from '../schemas';
import { getWallets } from '../utils';

export const getWalletsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: GetWalletsQuery; Reply: GetWalletResponse[] }>(
    '/',
    {
      schema: {
        description: 'Get all wallets across different chains',
        tags: ['/wallet'],
        querystring: GetWalletsQuerySchema,
        response: {
          200: {
            type: 'array',
            items: GetWalletResponseSchema,
          },
        },
      },
    },
    async (request) => {
      const { showReadOnly = true, showHardware = true } = request.query;
      logger.info(`Getting all wallets (showReadOnly: ${showReadOnly}, showHardware: ${showHardware})`);
      return await getWallets(fastify, showReadOnly, showHardware);
    },
  );
};

export default getWalletsRoute;

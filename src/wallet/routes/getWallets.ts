import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../services/logger';
import { GetWalletResponse, GetWalletResponseSchema } from '../schemas';
import { getWallets } from '../utils';

export const getWalletsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: GetWalletResponse[] }>(
    '/',
    {
      schema: {
        description: 'Get all wallets across different chains',
        tags: ['wallet'],
        response: {
          200: {
            type: 'array',
            items: GetWalletResponseSchema
          }
        }
      }
    },
    async () => {
      logger.info('Getting all wallets');
      return await getWallets();
    }
  );
};

export default getWalletsRoute;
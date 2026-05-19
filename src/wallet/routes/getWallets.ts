import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../services/logger';
import { GetWalletsQuery, GetWalletResponse, GetWalletResponseSchema, GetWalletsQuerySchema } from '../schemas';
import { getWallets } from '../utils';

export const getWalletsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: GetWalletsQuery; Reply: GetWalletResponse[] }>(
    '/',
    {
      schema: {
        description:
          'Get all wallets across chains. Response includes `walletAddresses` (backwards-compatible string[]) ' +
          'and `walletDetails` (enriched, one entry per address×network pair showing all registered networks). ' +
          'The `defaultWallet` field indicates the configured default address for each chain.',
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
      const { showHardware = true } = request.query;
      logger.info(`Getting all wallets (showHardware: ${showHardware})`);
      return await getWallets(fastify, true, showHardware);
    },
  );
};

export default getWalletsRoute;

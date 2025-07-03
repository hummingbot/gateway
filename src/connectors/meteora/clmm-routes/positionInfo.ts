import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  PositionInfo,
  PositionInfoSchema,
  GetPositionInfoRequestType,
  GetPositionInfoRequest,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get details for a specific Meteora position',
        tags: ['/connector/meteora'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: { type: 'string' },
          },
        },
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { positionAddress, walletAddress } = request.query;
        const network = request.query.network;
        const meteora = await Meteora.getInstance(network);

        try {
          new PublicKey(walletAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest(
            `Invalid wallet address: ${walletAddress}`,
          );
        }

        const position = await meteora.getPositionInfo(
          positionAddress,
          new PublicKey(walletAddress),
        );

        return position;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default positionInfoRoute;

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
  const firstWalletAddress = await Solana.getWalletAddressExample();

  // Update schema example
  GetPositionInfoRequest.properties.walletAddress.examples = [
    firstWalletAddress,
  ];

  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get details for a specific Meteora position',
        tags: ['meteora/clmm'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            walletAddress: {
              type: 'string',
              description: 'Will use first available wallet if not specified',
              examples: [firstWalletAddress],
            },
            positionAddress: {
              type: 'string',
              description: 'Meteora position',
            },
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
        const network = request.query.network || 'mainnet-beta';
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

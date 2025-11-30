import { FastifyPluginAsync } from 'fastify';

import {
  RemoveLiquidityRequestType as CLMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as CLMMRemoveLiquidityResponseType,
  RemoveLiquidityRequest as CLMMRemoveLiquidityRequest,
  RemoveLiquidityResponse as CLMMRemoveLiquidityResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function removeLiquidity(
  fastify: any,
  req: CLMMRemoveLiquidityRequestType,
): Promise<CLMMRemoveLiquidityResponseType> {
  let networkToUse = req.network ? req.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);

  const response: CLMMRemoveLiquidityResponseType = await osmosis.controller.removeLiquidityCLMM(osmosis, fastify, req);
  return response;
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.post<{
    Body: CLMMRemoveLiquidityRequestType;
    Reply: CLMMRemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from an Osmosis CL Position',
        tags: ['osmosis/connector'],
        body: {
          ...CLMMRemoveLiquidityRequest,
          properties: {
            ...CLMMRemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: {
              type: 'string',
              description: 'Position address',
              examples: ['1234'],
            },
            percentageToRemove: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              examples: [50],
            },
          },
        },
        response: {
          200: CLMMRemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        // Validate essential parameters
        const { positionAddress, percentageToRemove } = request.body;
        if (!positionAddress || percentageToRemove === undefined) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove < 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest('Percentage to remove must be between 0 and 100');
        }
        return await removeLiquidity(fastify, request.body);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }

        // Handle insufficient funds errors
        if (e.code === 'INSUFFICIENT_FUNDS' || (e.message && e.message.includes('insufficient funds'))) {
          throw fastify.httpErrors.badRequest(
            'Insufficient balance to pay for gas fees. Please add more to your wallet.',
          );
        }

        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

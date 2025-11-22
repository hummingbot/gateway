import { FastifyPluginAsync } from 'fastify';

import {
  RemoveLiquidityRequestType as AMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as AMMRemoveLiquidityResponseType,
  RemoveLiquidityRequest as AMMRemoveLiquidityRequest,
  RemoveLiquidityResponse as AMMRemoveLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function removeLiquidityAMM(
  fastify: any,
  req: AMMRemoveLiquidityRequestType,
): Promise<AMMRemoveLiquidityResponseType> {
  let networkToUse = req.network ? req.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);

  const response: AMMRemoveLiquidityResponseType = await osmosis.controller.removeLiquidityAMM(osmosis, fastify, req);
  return response;
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.post<{
    Body: AMMRemoveLiquidityRequestType;
    Reply: AMMRemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from an Osmosis GAMM pool',
        tags: ['osmosis/connector/amm'],
        body: {
          ...AMMRemoveLiquidityRequest,
          properties: {
            ...AMMRemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            percentageToRemove: { type: 'number', examples: [100] },
          },
        },
        response: {
          200: AMMRemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, percentageToRemove, walletAddress } = request.body;

        // Validate essential parameters
        if (!percentageToRemove || !network || !poolAddress || !walletAddress) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove <= 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest('Percentage to remove must be between 0 and 100');
        }
        return await removeLiquidityAMM(fastify, request.body);
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

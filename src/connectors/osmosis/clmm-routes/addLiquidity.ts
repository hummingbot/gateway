import { FastifyPluginAsync } from 'fastify';

import {
  AddLiquidityRequestType as CLMMAddLiquidityRequestType,
  AddLiquidityResponseType as CLMMAddLiquidityResponseType,
  AddLiquidityRequest as CLMMAddLiquidityRequest,
  AddLiquidityResponse as CLMMAddLiquidityResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function addLiquidityCLMM(
  fastify: any,
  req: CLMMAddLiquidityRequestType,
): Promise<CLMMAddLiquidityResponseType> {
  let networkToUse = req.network ? req.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);

  const response: CLMMAddLiquidityResponseType = await osmosis.controller.addLiquidityCLMM(osmosis, fastify, req);
  return response;
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  fastify.post<{
    Body: CLMMAddLiquidityRequestType;
    Reply: CLMMAddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an existing Osmosis CL position',
        tags: ['uniswap/clmm'],
        body: {
          ...CLMMAddLiquidityRequest,
          properties: {
            ...CLMMAddLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
            },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [200] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: CLMMAddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress: requestedWalletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        // Validate essential parameters
        if (
          !network ||
          !positionAddress ||
          !slippagePct ||
          (baseTokenAmount === undefined && quoteTokenAmount === undefined)
        ) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await Osmosis.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no wallets found.');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        return await addLiquidityCLMM(fastify, request.body);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }

        // Handle specific user-actionable errors
        if (e.message && e.message.includes('Insufficient allowance')) {
          throw fastify.httpErrors.badRequest(e.message);
        }

        // Handle insufficient funds errors
        if (e.code === 'INSUFFICIENT_FUNDS' || (e.message && e.message.includes('insufficient funds'))) {
          throw fastify.httpErrors.badRequest(
            'Insufficient balance to pay for gas fees. Please add more to your wallet.',
          );
        }

        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

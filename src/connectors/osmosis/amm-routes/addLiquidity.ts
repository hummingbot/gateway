import { FastifyPluginAsync } from 'fastify';

import {
  AddLiquidityRequestType as AMMAddLiquidityRequestType,
  AddLiquidityResponseType as AMMAddLiquidityResponseType,
  AddLiquidityRequest as AMMAddLiquidityRequest,
  AddLiquidityResponse as AMMAddLiquidityResponse,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function addLiquidityAMM(
  fastify: any,
  req: AMMAddLiquidityRequestType,
): Promise<AMMAddLiquidityResponseType> {
  let networkToUse = req.network ? req.network : 'mainnet';
  const osmosis = await Osmosis.getInstance(networkToUse);
  await osmosis.init();
  networkToUse = osmosis.network;
  logger.info(`Network: ${networkToUse}, Chain ID: ${osmosis.chainName}`);

  const response: AMMAddLiquidityResponseType = await osmosis.controller.addLiquidityAMM(osmosis, fastify, req);
  return response;
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Osmosis.getWalletAddressExample();

  fastify.post<{
    Body: AMMAddLiquidityRequestType;
    Reply: AMMAddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Osmosis GAMM pool',
        tags: ['osmosis/connector/amm'],
        body: {
          ...AMMAddLiquidityRequest,
          properties: {
            ...AMMAddLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['OSMO'] },
            quoteToken: { type: 'string', examples: ['ION'] },
            baseTokenAmount: { type: 'number', examples: [0.001] },
            quoteTokenAmount: { type: 'number', examples: [2.5] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: AMMAddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          walletAddress: requestedWalletAddress,
        } = request.body;

        if (
          !baseTokenAmount ||
          !quoteTokenAmount ||
          !slippagePct ||
          !requestedWalletAddress ||
          !network ||
          !poolAddress
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

        return await addLiquidityAMM(fastify, request.body);
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
            'Insufficient ETH balance to pay for gas fees. Please add more ETH to your wallet.',
          );
        }

        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

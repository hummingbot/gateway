import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  EstimateGasRequestType,
  EstimateGasResponse,
  EstimateGasRequestSchema,
  EstimateGasResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';

export async function estimateGasEthereum(
  fastify: FastifyInstance,
  network: string,
  _gasLimit?: number,
): Promise<EstimateGasResponse> {
  try {
    const ethereum = await Ethereum.getInstance(network);

    // Get gas price in GWEI
    const gasPrice = await ethereum.estimateGasPrice();

    return {
      feePerComputeUnit: gasPrice,
      denomination: 'gwei',
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Error estimating gas: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to estimate gas: ${error.message}`);
  }
}

export const estimateGasRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: EstimateGasRequestType;
    Reply: EstimateGasResponse;
  }>(
    '/estimate-gas',
    {
      schema: {
        description: 'Estimate gas prices for Ethereum transactions',
        tags: ['/chain/ethereum'],
        body: {
          ...EstimateGasRequestSchema,
          properties: {
            ...EstimateGasRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'arbitrum', 'optimism', 'base', 'sepolia', 'bsc', 'avalanche', 'celo', 'polygon'],
            },
            gasLimit: { type: 'number', examples: [21000] },
          },
        },
        response: {
          200: EstimateGasResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, gasLimit } = request.body;
      return await estimateGasEthereum(fastify, network, gasLimit);
    },
  );
};

export default estimateGasRoute;

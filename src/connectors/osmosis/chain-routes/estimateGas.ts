import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  EstimateGasRequestType,
  EstimateGasResponse,
  EstimateGasRequestSchema,
  EstimateGasResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

export async function estimateGasOsmosis(fastify: FastifyInstance, network: string): Promise<EstimateGasResponse> {
  try {
    const osmosis = await Osmosis.getInstance(network);
    await osmosis.init();
    return await osmosis.controller.estimateGas(osmosis);
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
        description: 'Estimate gas prices for Cosmos transactions',
        tags: ['/chain/cosmos'],
        body: {
          ...EstimateGasRequestSchema,
          properties: {
            ...EstimateGasRequestSchema.properties,
            network: {
              type: 'string',
              examples: ['mainnet', 'testnet'],
            },
          },
        },
        response: {
          200: EstimateGasResponseSchema,
        },
      },
    },
    async (request) => {
      const { network } = request.body;
      return await estimateGasOsmosis(fastify, network);
    },
  );
};

export default estimateGasRoute;

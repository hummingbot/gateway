import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  EstimateGasRequestType,
  EstimateGasResponse,
  EstimateGasRequestSchema,
  EstimateGasResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

export async function estimateGasSolana(
  fastify: FastifyInstance,
  network: string,
  _gasLimit?: number,
): Promise<EstimateGasResponse> {
  try {
    const solana = await Solana.getInstance(network);
    const priorityFeePerCUInLamports = await solana.estimateGasPrice();

    return {
      feePerComputeUnit: priorityFeePerCUInLamports,
      denomination: 'lamports',
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Error estimating gas: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to estimate gas: ${error.message}`,
    );
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
        description: 'Estimate gas prices for Solana transactions',
        tags: ['/chain/solana'],
        body: {
          ...EstimateGasRequestSchema,
          properties: {
            ...EstimateGasRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
            gasLimit: { type: 'number', examples: [200000] },
          },
        },
        response: {
          200: EstimateGasResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, gasLimit } = request.body;
      return await estimateGasSolana(fastify, network, gasLimit);
    },
  );
};

export default estimateGasRoute;

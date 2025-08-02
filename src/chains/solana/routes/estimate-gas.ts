import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { EstimateGasRequestType, EstimateGasResponse, EstimateGasResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaEstimateGasRequest } from '../schemas';
import { Solana } from '../solana';

export async function estimateGasSolana(fastify: FastifyInstance, network: string): Promise<EstimateGasResponse> {
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
    throw fastify.httpErrors.internalServerError(`Failed to estimate gas: ${error.message}`);
  }
}

export const estimateGasRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: EstimateGasRequestType;
    Reply: EstimateGasResponse;
  }>(
    '/estimate-gas',
    {
      schema: {
        description: 'Estimate gas prices for Solana transactions',
        tags: ['/chain/solana'],
        querystring: SolanaEstimateGasRequest,
        response: {
          200: EstimateGasResponseSchema,
        },
      },
    },
    async (request) => {
      const { network } = request.query;
      return await estimateGasSolana(fastify, network);
    },
  );
};

export default estimateGasRoute;

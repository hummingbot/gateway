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
    logger.error(`Error estimating gas for network ${network}: ${error.message}`);

    try {
      // If estimation fails but we can still get the instance, return the minPriorityFeePerCU
      const solana = await Solana.getInstance(network);
      return {
        feePerComputeUnit: solana.config.minPriorityFeePerCU || 0.1,
        denomination: 'lamports',
        timestamp: Date.now(),
      };
    } catch (instanceError) {
      logger.error(`Error getting Solana instance for network ${network}: ${instanceError.message}`);
      throw fastify.httpErrors.internalServerError(
        `Failed to get Solana instance for network ${network}: ${instanceError.message}`,
      );
    }
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

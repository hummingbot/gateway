import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { EstimateGasRequestType, EstimateGasResponse, EstimateGasResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { EthereumEstimateGasRequest } from '../schemas';

export async function estimateGasEthereum(fastify: FastifyInstance, network: string): Promise<EstimateGasResponse> {
  try {
    const ethereum = await Ethereum.getInstance(network);

    // Get gas price in GWEI (this already includes fallback to minGasPrice)
    const gasPrice = await ethereum.estimateGasPrice();

    return {
      feePerComputeUnit: gasPrice,
      denomination: 'gwei',
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Error estimating gas for network ${network}: ${error.message}`);

    try {
      // If estimation fails but we can still get the instance, return the minGasPrice
      const ethereum = await Ethereum.getInstance(network);
      return {
        feePerComputeUnit: ethereum.minGasPrice,
        denomination: 'gwei',
        timestamp: Date.now(),
      };
    } catch (instanceError) {
      logger.error(`Error getting Ethereum instance for network ${network}: ${instanceError.message}`);
      throw fastify.httpErrors.internalServerError(
        `Failed to get Ethereum instance for network ${network}: ${instanceError.message}`,
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
        description: 'Estimate gas prices for Ethereum transactions',
        tags: ['/chain/ethereum'],
        querystring: EthereumEstimateGasRequest,
        response: {
          200: EstimateGasResponseSchema,
        },
      },
    },
    async (request) => {
      const { network } = request.query;
      return await estimateGasEthereum(fastify, network);
    },
  );
};

export default estimateGasRoute;

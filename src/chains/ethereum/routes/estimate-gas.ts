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

    // Default gas limit for Ethereum is 300000
    const DEFAULT_GAS_LIMIT = 300000;

    // Calculate total fee in GWEI
    const totalFeeInGwei = gasPrice * DEFAULT_GAS_LIMIT;

    // Convert GWEI to ETH (1 ETH = 10^9 GWEI)
    const totalFeeInEth = totalFeeInGwei / 1e9;

    // Check if we have EIP-1559 data cached
    const isEIP1559Network =
      network === 'mainnet' ||
      network === 'polygon' ||
      network === 'arbitrum' ||
      network === 'optimism' ||
      network === 'base';

    const response: EstimateGasResponse = {
      feePerComputeUnit: gasPrice,
      denomination: 'gwei',
      computeUnits: DEFAULT_GAS_LIMIT,
      feeAsset: ethereum.nativeTokenSymbol,
      fee: totalFeeInEth,
      timestamp: Date.now(),
    };

    // Add EIP-1559 details if available
    if (isEIP1559Network && (ethereum as any).constructor.lastGasPriceEstimate?.isEIP1559) {
      const cached = (ethereum as any).constructor.lastGasPriceEstimate;
      response.gasType = 'eip1559';
      response.maxFeePerGas = cached.maxFeePerGas;
      response.maxPriorityFeePerGas = cached.maxPriorityFeePerGas;
    } else if (!isEIP1559Network) {
      response.gasType = 'legacy';
    }

    return response;
  } catch (error) {
    logger.error(`Error estimating gas for network ${network}: ${error.message}`);

    try {
      // If estimation fails but we can still get the instance, return the minGasPrice
      const ethereum = await Ethereum.getInstance(network);

      // Default gas limit for Ethereum is 300000
      const DEFAULT_GAS_LIMIT = 300000;

      // Calculate total fee in GWEI using minGasPrice
      const totalFeeInGwei = ethereum.minGasPrice * DEFAULT_GAS_LIMIT;

      // Convert GWEI to ETH (1 ETH = 10^9 GWEI)
      const totalFeeInEth = totalFeeInGwei / 1e9;

      return {
        feePerComputeUnit: ethereum.minGasPrice,
        denomination: 'gwei',
        computeUnits: DEFAULT_GAS_LIMIT,
        feeAsset: ethereum.nativeTokenSymbol,
        fee: totalFeeInEth,
        timestamp: Date.now(),
        gasType: 'legacy',
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

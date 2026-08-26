import { FastifyInstance } from 'fastify';

import { EstimateGasResponse } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum, EIP1559_NETWORKS } from '../ethereum';

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
    const isEIP1559Network = EIP1559_NETWORKS.includes(network);

    const response: EstimateGasResponse = {
      feePerComputeUnit: gasPrice,
      denomination: 'gwei',
      computeUnits: DEFAULT_GAS_LIMIT,
      feeAsset: ethereum.nativeTokenSymbol,
      fee: totalFeeInEth,
      timestamp: Date.now(),
    };

    // Add EIP-1559 details if available (cache was populated by estimateGasPrice above)
    const cached = ethereum.getCachedGasPriceEstimate();
    if (isEIP1559Network && cached?.isEIP1559) {
      response.gasType = 'eip1559';
      response.maxFeePerGas = cached.maxFeePerGas;
      response.maxPriorityFeePerGas = cached.maxPriorityFeePerGas;
    } else {
      response.gasType = 'legacy';
    }

    return response;
  } catch (error) {
    logger.error(`Error estimating gas for network ${network}: ${error.message}`);

    if (error.statusCode === 429) {
      throw error;
    }

    // Check if it's a network/RPC error
    if (error.message?.includes('RPC') || error.message?.includes('network') || error.message?.includes('provider')) {
      throw fastify.httpErrors.serviceUnavailable(`RPC provider unavailable for network ${network}: ${error.message}`);
    }

    // Check if it's an invalid network
    if (
      error.message?.includes('Invalid') ||
      error.message?.includes('not found') ||
      error.message?.includes('Unsupported')
    ) {
      throw fastify.httpErrors.badRequest(`Invalid network ${network}: ${error.message}`);
    }

    // Generic error
    throw fastify.httpErrors.internalServerError(`Failed to estimate gas for network ${network}: ${error.message}`);
  }
}

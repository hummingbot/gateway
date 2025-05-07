import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import { EstimateGasRequestType, EstimateGasResponse, EstimateGasRequestSchema, EstimateGasResponseSchema } from '../../../schemas/chain-schema';
import { gasCostInEthString } from '../../../services/base';

export async function estimateGasEthereum(
  fastify: FastifyInstance,
  network: string,
  gasLimit?: number
): Promise<EstimateGasResponse> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    
    // Get gas price in GWEI
    const gasPrice = await ethereum.estimateGasPrice();
    
    // Use provided gas limit or default from config
    const gasLimitUsed = gasLimit || ethereum.gasLimitTransaction;
    
    // Calculate total gas cost in ETH
    const gasCost = parseFloat(gasCostInEthString(gasPrice, gasLimitUsed));
    
    return {
      gasPrice: gasPrice,
      gasPriceToken: ethereum.nativeTokenSymbol,
      gasLimit: gasLimitUsed,
      gasCost: gasCost
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
        tags: ['ethereum'],
        body: {
          ...EstimateGasRequestSchema,
          properties: {
            ...EstimateGasRequestSchema.properties,
            network: { type: 'string', examples: ['base', 'mainnet', 'sepolia', 'polygon'] },
            gasLimit: { type: 'number', examples: [21000] }
          }
        },
        response: {
          200: EstimateGasResponseSchema
        }
      }
    },
    async (request) => {
      const { network, gasLimit } = request.body;
      return await estimateGasEthereum(fastify, network, gasLimit);
    }
  );
};

export default estimateGasRoute;
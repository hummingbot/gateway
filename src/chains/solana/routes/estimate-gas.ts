import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../solana';
import { logger } from '../../../services/logger';
import { EstimateGasRequestType, EstimateGasResponse, EstimateGasRequestSchema, EstimateGasResponseSchema } from '../../../schemas/chain-schema';
import { BASE_FEE } from '../solana';

export async function estimateGasSolana(
  fastify: FastifyInstance,
  network: string,
  gasLimit?: number
): Promise<EstimateGasResponse> {
  try {
    const solana = await Solana.getInstance(network);
    const gasLimitUsed = gasLimit || solana.config.defaultComputeUnits;
    const gasCost = await solana.estimateGas(gasLimitUsed);
    const priorityFeeInLamports = await solana.estimateGasPrice();
    
    return {
      gasPrice: priorityFeeInLamports,
      gasPriceToken: solana.nativeTokenSymbol,
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
        description: 'Estimate gas prices for Solana transactions',
        tags: ['solana'],
        body: {
          ...EstimateGasRequestSchema,
          properties: {
            ...EstimateGasRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
            gasLimit: { type: 'number', examples: [200000] }
          }
        },
        response: {
          200: EstimateGasResponseSchema
        }
      }
    },
    async (request) => {
      const { network, gasLimit } = request.body;
      return await estimateGasSolana(fastify, network, gasLimit);
    }
  );
};

export default estimateGasRoute;

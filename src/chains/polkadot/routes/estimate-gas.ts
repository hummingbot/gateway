import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {
  EstimateGasRequestSchema,
  EstimateGasRequestType,
  EstimateGasResponse,
  EstimateGasResponseSchema
} from '../../../schemas/chain-schema';
import {logger} from '../../../services/logger';
import {HttpException} from '../../../services/error-handler';

export async function estimateGasPolkadot(
  _fastify: FastifyInstance,
  network: string,
  _gasLimit?: number
): Promise<EstimateGasResponse> {
  try {
    const polkadot = await Polkadot.getInstance(network);
    
    return {
      gasPrice: 0,
      gasPriceToken: polkadot.config.network.nativeCurrencySymbol,
      gasLimit: 0,
      gasCost: 0
    };
  } catch (error) {
    logger.error(`Error estimating gas: ${error.message}`);
    throw new HttpException(
      500,
      `Failed to estimate gas: ${error.message}`,
      5004
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
        description: 'Estimate gas for a Polkadot transaction',
        tags: ['polkadot'],
        body: {
          ...EstimateGasRequestSchema,
          properties: {
            ...EstimateGasRequestSchema.properties,
            chain: { type: 'string', enum: ['polkadot'], examples: ['polkadot'] },
            network: { type: 'string', examples: ['mainnet', 'westend'] },
            gasLimit: { type: 'number', examples: [100000] }
          }
        },
        response: {
          200: EstimateGasResponseSchema
        }
      }
    },
    async (request) => {
      const { network, gasLimit } = request.body;
      
      return await estimateGasPolkadot(
        fastify,
        network,
        gasLimit
      );
    }
  );
};

export default estimateGasRoute; 
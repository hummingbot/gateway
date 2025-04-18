import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {
  EstimateGasRequestSchema,
  EstimateGasRequestType,
  EstimateGasResponse,
  EstimateGasResponseSchema
} from '../../../schemas/chain-schema';
import {HttpException} from '../../../services/error-handler';

/**
 * Estimates gas (fees) for a Polkadot transaction
 * 
 * For Polkadot networks, this provides fee estimation information including:
 * - Gas price (usually 0 as Polkadot uses weight-based fees)
 * - Gas price token (native currency symbol)
 * - Gas limit (if specified)
 * - Gas cost estimate
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @param gasLimit Optional gas limit for the transaction
 * @returns Gas estimation information
 */
export async function estimateGasPolkadot(
  _fastify: FastifyInstance,
  network: string,
  gasLimit?: number
): Promise<EstimateGasResponse> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.estimateTransactionGas(gasLimit);
}

/**
 * Route plugin that registers the gas estimation endpoint
 */
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
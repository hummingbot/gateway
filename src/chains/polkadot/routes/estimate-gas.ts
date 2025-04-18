import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {
  EstimateGasRequestSchema,
  EstimateGasRequestType,
  EstimateGasResponse,
  EstimateGasResponseSchema
} from '../../../schemas/chain-schema';

export async function estimateGasPolkadot(
  _fastify: FastifyInstance,
  network: string,
  gasLimit?: number
): Promise<EstimateGasResponse> {
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.estimateTransactionGas(gasLimit);
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
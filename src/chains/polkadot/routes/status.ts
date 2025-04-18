import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {
  StatusRequestSchema,
  StatusRequestType,
  StatusResponseSchema,
  StatusResponseType
} from '../../../schemas/chain-schema';

export async function getPolkadotStatus(
  _fastify: FastifyInstance,
  network: string
): Promise<StatusResponseType> {
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.getNetworkStatus();
}

export const statusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: StatusRequestType;
    Reply: StatusResponseType;
  }>(
    '/status',
    {
      schema: {
        description: 'Get Polkadot network status',
        tags: ['polkadot'],
        querystring: StatusRequestSchema,
        response: {
          200: StatusResponseSchema
        }
      }
    },
    async (request) => {
      return await getPolkadotStatus(fastify, request.query.network);
    }
  );
};

export default statusRoute; 
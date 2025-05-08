import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { PolkadotStatusRequest, PolkadotStatusResponse, PolkadotStatusRequestSchema, PolkadotStatusResponseSchema } from '../polkadot.types';

/**
 * Gets network status information from the Polkadot blockchain
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @returns Network status information
 */
export async function getPolkadotStatus(
  _fastify: FastifyInstance,
  network: string
): Promise<PolkadotStatusResponse> {
  if (!network) {
    throw new Error('Network parameter is required');
  }
  
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.getNetworkStatus();
}

/**
 * Route plugin that registers the status endpoint
 */
export const statusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: PolkadotStatusRequest;
    Reply: PolkadotStatusResponse;
  }>(
    '/status',
    {
      schema: {
        description: 'Get Polkadot network status',
        tags: ['polkadot'],
        querystring: PolkadotStatusRequestSchema,
        response: {
          200: PolkadotStatusResponseSchema
        }
      }
    },
    async (request) => {
      return await getPolkadotStatus(
        fastify,
        request.query.network
      );
    }
  );
};

export default statusRoute; 
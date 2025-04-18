import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {
  StatusRequestSchema,
  StatusRequestType,
  StatusResponseSchema,
  StatusResponseType
} from '../../../schemas/chain-schema';
import {HttpException} from '../../../services/error-handler';

/**
 * Retrieves the current status of a Polkadot network
 * 
 * Returns network information including:
 * - Chain identifier
 * - Network name
 * - RPC URL
 * - Current block number
 * - Native currency symbol
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @returns Network status response
 */
export async function getPolkadotStatus(
  _fastify: FastifyInstance,
  network: string
): Promise<StatusResponseType> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.getNetworkStatus();
}

/**
 * Route plugin that registers the status endpoint
 */
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
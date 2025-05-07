import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { PolkadotPollRequest, PolkadotPollResponse, PolkadotPollRequestSchema, PolkadotPollResponseSchema } from '../polkadot.types';

/**
 * Polls transaction status on the Polkadot network
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @param txHash Transaction hash to poll
 * @returns Transaction status information
 */
export async function pollPolkadotTransaction(
  _fastify: FastifyInstance,
  network: string,
  txHash: string
): Promise<PolkadotPollResponse> {
  if (!network) {
    throw new Error('Network parameter is required');
  }
  
  if (!txHash) {
    throw new Error('Transaction hash parameter is required');
  }
  
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.pollTransaction(txHash);
}

/**
 * Route plugin that registers the transaction polling endpoint
 */
export const pollRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PolkadotPollRequest;
    Reply: PolkadotPollResponse;
  }>(
    '/poll',
    {
      schema: {
        description: 'Poll transaction status on Polkadot network',
        tags: ['polkadot'],
        body: PolkadotPollRequestSchema,
        response: {
          200: PolkadotPollResponseSchema
        }
      }
    },
    async (request) => {
      return await pollPolkadotTransaction(
        fastify,
        request.body.network,
        request.body.txHash
      );
    }
  );
};

export default pollRoute; 
import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {PollRequestSchema, PollRequestType, PollResponseSchema, PollResponseType} from '../../../schemas/chain-schema';
import {HttpException} from '../../../services/error-handler';

/**
 * Polls for the status of a Polkadot transaction
 * 
 * Checks the current status of a transaction identified by its hash.
 * Returns information including:
 * - Current block number
 * - Transaction inclusion block (if found)
 * - Transaction status (not found, pending, success, failed)
 * - Transaction data (if available)
 * - Transaction fee (if available)
 * 
 * @param fastify Fastify instance
 * @param network Network identifier (e.g., 'mainnet', 'westend')
 * @param txHash Transaction hash to check
 * @returns Transaction status information
 */
export async function pollPolkadotTransaction(
  _fastify: FastifyInstance,
  network: string,
  txHash: string
): Promise<PollResponseType> {
  if (!network) {
    throw new HttpException(400, 'Network parameter is required', -1);
  }
  
  if (!txHash) {
    throw new HttpException(400, 'Transaction hash parameter is required', -1);
  }
  
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.pollTransaction(txHash);
}

/**
 * Route plugin that registers the transaction polling endpoint
 */
export const pollRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PollRequestType;
    Reply: PollResponseType;
  }>(
    '/poll',
    {
      schema: {
        description: 'Poll for transaction status',
        tags: ['polkadot'],
        body: PollRequestSchema,
        response: {
          200: PollResponseSchema
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
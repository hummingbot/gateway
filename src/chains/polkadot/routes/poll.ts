import {FastifyInstance, FastifyPluginAsync} from 'fastify';
import {Polkadot} from '../polkadot';
import {PollRequestSchema, PollRequestType, PollResponseSchema, PollResponseType} from '../../../schemas/chain-schema';

export async function pollPolkadotTransaction(
  _fastify: FastifyInstance,
  network: string,
  txHash: string
): Promise<PollResponseType> {
  const polkadot = await Polkadot.getInstance(network);
  return await polkadot.pollTransaction(txHash);
}

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
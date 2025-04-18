import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Polkadot } from '../polkadot';
import { PollRequestType, PollResponseType, PollRequestSchema, PollResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';

export async function pollPolkadotTransaction(
  _fastify: FastifyInstance,
  network: string,
  txHash: string
): Promise<PollResponseType> {
  const polkadot = await Polkadot.getInstance(network);
  
  try {
    const txResult = await polkadot.getTransaction(txHash);
    
    return {
      currentBlock: await polkadot.getCurrentBlockNumber(),
      txHash,
      txBlock: txResult.txBlock,
      txStatus: txResult.txStatus,
      txData: txResult.txData,
      fee: txResult.fee
    };
  } catch (error) {
    logger.error(`Error in poll: ${error.message}`);
    const currentBlock = await polkadot.getCurrentBlockNumber();
    
    return {
      currentBlock,
      txHash,
      txBlock: currentBlock,
      txStatus: 0,
      txData: {},
      fee: null
    };
  }
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
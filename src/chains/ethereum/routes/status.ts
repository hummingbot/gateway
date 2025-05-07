import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import { StatusRequestType, StatusResponseType, StatusRequestSchema, StatusResponseSchema } from '../../../schemas/chain-schema';

export async function getEthereumStatus(
  network: string
): Promise<StatusResponseType> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    const chain = 'ethereum';
    const rpcUrl = ethereum.rpcUrl;
    const nativeCurrency = ethereum.nativeTokenSymbol;
    
    // Directly try to get the current block number with a timeout
    let currentBlockNumber = 0;
    try {
      // Set up a timeout promise to prevent hanging on unresponsive nodes
      const blockPromise = ethereum.provider.getBlockNumber();
      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 5000);
      });
      
      // Race the block request against the timeout
      currentBlockNumber = await Promise.race([blockPromise, timeoutPromise]);
    } catch (blockError) {
      logger.warn(`Failed to get block number: ${blockError.message}`);
      // Continue with default block number
    }
    
    return {
      chain,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency
    };
  } catch (error) {
    logger.error(`Error getting Ethereum status: ${error.message}`);
    throw new Error(`Failed to get Ethereum status: ${error.message}`);
  }
}

export const statusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: StatusRequestType;
    Reply: StatusResponseType;
  }>(
    '/status',
    {
      schema: {
        description: 'Get Ethereum chain status',
        tags: ['ethereum'],
        querystring: {
          ...StatusRequestSchema,
          properties: {
            ...StatusRequestSchema.properties,
            network: { type: 'string', examples: ['base', 'mainnet', 'sepolia', 'polygon'] }
          }
        },
        response: {
          200: StatusResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { network } = request.query;
      try {
        // This will handle node timeout internally
        return await getEthereumStatus(network);
      } catch (error) {
        // This will catch any other unexpected errors
        logger.error(`Error in Ethereum status endpoint: ${error.message}`);
        reply.status(500);
        // Return a minimal valid response
        return {
          chain: 'ethereum',
          network,
          rpcUrl: 'unavailable',
          currentBlockNumber: 0,
          nativeCurrency: 'ETH',
        };
      }
    }
  );
};

export default statusRoute;
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { StatusRequestType, StatusResponseType, StatusResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaStatusRequest } from '../schemas';
import { Solana } from '../solana';
import { getSolanaChainConfig } from '../solana.config';

export async function getSolanaStatus(fastify: FastifyInstance, network: string): Promise<StatusResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const chainConfig = getSolanaChainConfig();
    const chain = 'solana';
    const rpcProvider = chainConfig.rpcProvider || 'url';

    // Get the actual RPC URL based on provider
    let rpcUrl = solana.config.nodeURL; // Default to nodeURL
    if (rpcProvider === 'helius') {
      const heliusService = solana.getHeliusService();
      if (heliusService) {
        try {
          rpcUrl = heliusService.getHttpUrl();
        } catch (error) {
          // If Helius URL generation fails, fall back to nodeURL
          logger.warn(`Failed to get Helius URL, using nodeURL: ${error.message}`);
        }
      }
    }

    const nativeCurrency = solana.config.nativeCurrencySymbol;
    const swapProvider = solana.config.swapProvider || '';
    const currentBlockNumber = await solana.getCurrentBlockNumber();

    return {
      chain,
      network,
      rpcUrl,
      rpcProvider,
      currentBlockNumber,
      nativeCurrency,
      swapProvider,
    };
  } catch (error) {
    logger.error(`Error getting Solana status: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get Solana status: ${error.message}`);
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
        description: 'Get Solana network status',
        tags: ['/chain/solana'],
        querystring: SolanaStatusRequest,
        response: {
          200: StatusResponseSchema,
        },
      },
    },
    async (request) => {
      const { network } = request.query;
      return await getSolanaStatus(fastify, network);
    },
  );
};

export default statusRoute;

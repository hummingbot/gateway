import { FastifyPluginAsync } from 'fastify';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { 
  PositionInfo, 
  PositionInfoSchema, 
  GetPositionInfoRequestType, 
  GetPositionInfoRequest 
} from '../../../services/clmm-interfaces'
import { PublicKey } from '@solana/web3.js';

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  GetPositionInfoRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get details for a specific Meteora position',
        tags: ['meteora'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            walletAddress: {
              type: 'string',
              description: 'Will use first available wallet if not specified',
              examples: [firstWalletAddress]
            },
            positionAddress: {
              type: 'string',
              description: 'Meteora position'
            }
          }
        },
        response: {
          200: PositionInfoSchema
        },
      }
    },
    async (request) => {
      try {
        const { positionAddress, walletAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';
        const meteora = await Meteora.getInstance(network);

        try {
          new PublicKey(walletAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
        }

        const position = await meteora.getPositionInfo(
          positionAddress,
          new PublicKey(walletAddress)
        );

        return position;
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default positionInfoRoute;
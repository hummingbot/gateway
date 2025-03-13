import { FastifyPluginAsync } from 'fastify';
import { Hydration } from '../hydration';
import { Polkadot } from '../../../chains/polkadot/polkadot';
import { logger } from '../../../services/logger';
import { 
  PositionInfoSchema, 
  GetPositionInfoRequestType, 
  GetPositionInfoRequest 
} from '../../../services/clmm-interfaces';
import { httpBadRequest, httpNotFound } from '../../../services/error-handler';

/**
 * Route handler for getting information about a specific position
 */
export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '<polkadot-wallet-address>';
  
  const foundWallet = await polkadot.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }
  
  // Update schema example
  GetPositionInfoRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.get(
    '/position-info',
    {
      schema: {
        description: 'Get details for a specific Hydration position',
        tags: ['hydration'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet'] },
            walletAddress: {
              type: 'string',
              description: 'Will use first available wallet if not specified',
              examples: [firstWalletAddress]
            },
            positionAddress: {
              type: 'string',
              description: 'Hydration position',
              examples: ['hydration-position-0']
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
        const { positionAddress, walletAddress } = request.query as GetPositionInfoRequestType;
        const network = (request.query as GetPositionInfoRequestType).network || 'mainnet';
        
        const hydration = await Hydration.getInstance(network);
        const polkadot = await Polkadot.getInstance(network);
        
        // Validate address
        try {
          polkadot.validatePolkadotAddress(walletAddress);
        } catch (error) {
          throw httpBadRequest(`Invalid wallet address: ${walletAddress}`);
        }
        
        // Get wallet
        const wallet = await polkadot.getWallet(walletAddress);
        
        // Get position info
        try {
          const position = await hydration.getPositionInfo(positionAddress, wallet);
          
          // Map to response format
          return {
            positionAddress: position.positionAddress,
            ownerAddress: position.ownerAddress,
            poolAddress: position.poolAddress,
            baseToken: {
              symbol: position.baseToken.symbol,
              address: position.baseToken.address,
              decimals: position.baseToken.decimals,
              name: position.baseToken.name
            },
            quoteToken: {
              symbol: position.quoteToken.symbol,
              address: position.quoteToken.address,
              decimals: position.quoteToken.decimals,
              name: position.quoteToken.name
            },
            lowerPrice: position.lowerPrice,
            upperPrice: position.upperPrice,
            baseTokenAmount: position.baseTokenAmount,
            quoteTokenAmount: position.quoteTokenAmount,
            baseFeeAmount: position.baseFeeAmount,
            quoteFeeAmount: position.quoteFeeAmount,
            liquidity: position.liquidity,
            inRange: position.inRange,
            createdAt: position.createdAt,
            apr: position.apr
          };
        } catch (error) {
          throw httpNotFound(`Position not found: ${positionAddress}`);
        }
      } catch (e) {
        logger.error('Error in position-info:', e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default positionInfoRoute;


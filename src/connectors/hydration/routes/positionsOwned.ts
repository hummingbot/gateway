import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Hydration } from '../hydration';
import { Polkadot } from '../../../chains/polkadot/polkadot';
import { logger } from '../../../services/logger';
import { PositionInfoSchema } from '../../../services/clmm-interfaces';
import { httpBadRequest, ERROR_MESSAGES } from '../../../services/error-handler';

// Schema definitions
const GetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet' })),
  walletAddress: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  poolAddress: Type.String({ 
    examples: ['hydration-pool-0'] 
  }),
});

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedRequestType = Static<typeof GetPositionsOwnedRequest>;
type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

/**
 * Route handler for getting positions owned by a wallet in a pool
 */
export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
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
  GetPositionsOwnedRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.get(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of positions owned by a user's wallet in a specific Hydration pool",
        tags: ['hydration'],
        querystring: GetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse
        },
      }
    },
    async (request) => {
      try {
        const { walletAddress, poolAddress } = request.query;
        const network = request.query.network || 'mainnet';
        
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
        
        // Get positions
        const positions = await hydration.getPositionsInPool(poolAddress, wallet);
        
        // Map to response format
        return positions.map(position => ({
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
        }));
      } catch (e) {
        logger.error('Error in positions-owned:', e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default positionsOwnedRoute;


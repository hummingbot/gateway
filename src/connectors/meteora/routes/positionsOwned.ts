import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../../../services/logger';
import { Solana } from '../../../chains/solana/solana';
import { PositionInfoSchema } from '../../../services/clmm-interfaces';

// Schema definitions
const GetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  walletAddress: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  poolAddress: Type.String({ 
    examples: ['FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'] 
  }),
});

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedRequestType = Static<typeof GetPositionsOwnedRequest>;
type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  GetPositionsOwnedRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of positions owned by a user's wallet in a specific Meteora pool",
        tags: ['meteora'],
        querystring: GetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse
        },
      }
    },
    async (request) => {
      try {
        const { walletAddress, poolAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';
        const meteora = await Meteora.getInstance(network);
        
        try {
          new PublicKey(walletAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
        }

        const positions = await meteora.getPositionsInPool(
          poolAddress,
          new PublicKey(walletAddress)
        );

        return positions;
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default positionsOwnedRoute; 
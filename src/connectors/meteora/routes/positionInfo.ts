import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { PositionInfoSchema } from '../../../services/common-interfaces';
import { PublicKey } from '@solana/web3.js';

const PositionInfoRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  positionAddress: Type.String(),
  walletAddress: Type.String({ 
    description: 'Wallet address that owns the position',
    examples: [] // Will be populated during route registration
  }),
});

const PositionInfoResponse = PositionInfoSchema;

type PositionInfoRequestType = Static<typeof PositionInfoRequest>;
type PositionInfoResponseType = Static<typeof PositionInfoResponse>;

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
  PositionInfoRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.get<{
    Querystring: PositionInfoRequestType;
    Reply: PositionInfoResponseType;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get details for a specific Meteora position',
        tags: ['meteora'],
        querystring: PositionInfoRequest,
        response: {
          200: PositionInfoResponse
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
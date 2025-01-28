import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { PositionInfoSchema } from '../../../services/common-interfaces';

const PositionInfoRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  positionAddress: Type.String(),
  address: Type.String({ 
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
  PositionInfoRequest.properties.address.examples = [firstWalletAddress];

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
        const { positionAddress, address } = request.query;
        const network = request.query.network || 'mainnet-beta';

        const meteora = await Meteora.getInstance(network);
        const solana = await Solana.getInstance(network);
        const wallet = await solana.getWallet(address);
        const position = await meteora.getPosition(positionAddress, wallet.publicKey);
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
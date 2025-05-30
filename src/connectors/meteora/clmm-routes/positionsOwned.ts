import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
// Using Fastify's native error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) =>
  `Invalid Solana address: ${address}`;

// Schema definitions
const GetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  walletAddress: Type.String({
    description: 'Will use first available wallet if not specified',
    examples: [], // Will be populated during route registration
  }),
  poolAddress: Type.String({
    examples: ['FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'],
  }),
});

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedRequestType = Static<typeof GetPositionsOwnedRequest>;
type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';

  const foundWallet = await solana.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }

  // Update schema example
  GetPositionsOwnedRequest.properties.walletAddress.examples = [
    firstWalletAddress,
  ];

  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description:
          "Retrieve a list of positions owned by a user's wallet in a specific Meteora pool",
        tags: ['meteora/clmm'],
        querystring: GetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, poolAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';
        const meteora = await Meteora.getInstance(network);

        // Validate addresses first
        try {
          new PublicKey(poolAddress);
          new PublicKey(walletAddress);
        } catch (error) {
          const invalidAddress = error.message.includes(poolAddress)
            ? 'pool'
            : 'wallet';
          throw fastify.httpErrors.badRequest(
            INVALID_SOLANA_ADDRESS_MESSAGE(invalidAddress),
          );
        }

        const positions = await meteora.getPositionsInPool(
          poolAddress,
          new PublicKey(walletAddress),
        );

        return positions;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default positionsOwnedRoute;

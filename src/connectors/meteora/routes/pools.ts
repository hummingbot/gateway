import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';

// Schema definitions
const GetPoolsRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  limit: Type.Optional(Type.Number({ minimum: 1, default: 100 })),
  tokenA: Type.Optional(Type.String({
    description: 'First token symbol or address'
  })),
  tokenB: Type.Optional(Type.String({
    description: 'Second token symbol or address'
  })),
});

const GetPoolsResponse = Type.Array(
  Type.Object({
    address: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    binStep: Type.Number(),
  })
);

type GetPoolsRequestType = Static<typeof GetPoolsRequest>;
type GetPoolsResponseType = Static<typeof GetPoolsResponse>;

const transformLbPair = (pair: any) => {
  try {
    return {
      address: pair.publicKey.toString(),
      baseTokenAddress: pair.account.tokenXMint,
      quoteTokenAddress: pair.account.tokenYMint,
      binStep: pair.account.binStep,
    };
  } catch (error) {
    logger.error(`Error processing pair ${pair?.publicKey?.toString()}: ${error.message}`);
    return null;
  }
};

export const poolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolsRequestType;
    Reply: GetPoolsResponseType;
  }>('/pools', {
    schema: {
      querystring: GetPoolsRequest,
      response: {
        200: GetPoolsResponse
      },
      tags: ['meteora'],
      description: 'Fetch info about Meteora pools'
    },
    handler: async (request, _reply) => {
      try {
        const { limit, tokenA, tokenB } = request.query;
        const network = request.query.network || 'mainnet-beta';
        const meteora = await Meteora.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Convert token symbols/addresses to addresses using getToken
        const addressA = tokenA ? solana.getToken(tokenA)?.address : undefined;
        const addressB = tokenB ? solana.getToken(tokenB)?.address : undefined;

        if ((tokenA && !addressA) || (tokenB && !addressB)) {
          throw fastify.httpErrors.badRequest(
            `Token not found: ${!addressA ? tokenA : tokenB}`
          );
        }

        const pairs = await meteora.getLbPairs(limit, addressA, addressB);
        return pairs.map(transformLbPair);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) return e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  });
};

export default poolsRoute; 
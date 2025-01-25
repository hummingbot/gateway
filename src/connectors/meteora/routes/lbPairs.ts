import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { logger } from '../../../services/logger';

// Schema definitions
const GetLbPairsRequest = Type.Object({
  network: Type.String({ default: 'mainnet-beta' }),
  limit: Type.Optional(Type.Number({ minimum: 1, default: 100 })),
});

const GetLbPairsResponse = Type.Array(
  Type.Object({
    publicKey: Type.String(),
    tokenXMint: Type.String(),
    tokenYMint: Type.String(),
    binStep: Type.Number(),
  })
);

type GetLbPairsRequestType = Static<typeof GetLbPairsRequest>;
type GetLbPairsResponseType = Static<typeof GetLbPairsResponse>;

const transformLbPair = (pair: any) => {
  try {
    return {
      publicKey: pair.publicKey.toString(),
      tokenXMint: pair.account.tokenXMint,
      tokenYMint: pair.account.tokenYMint,
      binStep: pair.account.binStep,
    };
  } catch (error) {
    logger.error(`Error processing pair ${pair?.publicKey?.toString()}: ${error.message}`);
    return null;
  }
};

export const lbPairsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetLbPairsRequestType;
    Reply: GetLbPairsResponseType;
  }>('/lb-pairs', {
    schema: {
      querystring: GetLbPairsRequest,
      response: {
        200: GetLbPairsResponse
      },
      tags: ['meteora'],
      description: 'Get Meteora LB pairs information'
    },
    handler: async (request, _reply) => {
      try {
        const { network, limit } = request.query;
        const meteora = await Meteora.getInstance(network);
        const pairs = await meteora.getLbPairs(limit);
        return pairs.map(transformLbPair);
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  });
};

export default lbPairsRoute; 
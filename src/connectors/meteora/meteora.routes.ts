import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Solana } from '../../chains/solana/solana';
import { Meteora } from './meteora';
import { getPositionsOwnedBy, getActiveBin } from './meteora.controllers';

// Request/Response Schemas
export const GetPositionsOwnedRequestSchema = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
  address: Type.Optional(Type.String()),
});

export const GetPositionsOwnedResponseSchema = Type.Object({
  activeBin: Type.Object({
    binId: Type.Number(),
    price: Type.String(),
    pricePerToken: Type.String(),
    liquiditySupply: Type.String(),
  }),
  userPositions: Type.Array(Type.Object({
    positionAddress: Type.String(),
    lowerBinId: Type.Number(),
    upperBinId: Type.Number(),
    liquidityShares: Type.String(),
    rewardInfos: Type.Array(Type.Any()),
  })),
});

export const GetActiveBinRequestSchema = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
});

export const GetActiveBinResponseSchema = Type.Object({
  binId: Type.Number(),
  xAmount: Type.Number(),
  yAmount: Type.Number(),
  price: Type.String(),
  pricePerToken: Type.String(),
});

// TypeScript types
export type GetPositionsOwnedRequest = Static<typeof GetPositionsOwnedRequestSchema>;
export type GetPositionsOwnedResponse = Static<typeof GetPositionsOwnedResponseSchema>;
export type GetActiveBinRequest = Static<typeof GetActiveBinRequestSchema>;
export type GetActiveBinResponse = Static<typeof GetActiveBinResponseSchema>;

export const meteoraRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /meteora/positions-owned
  fastify.get<{ Querystring: GetPositionsOwnedRequest; Reply: GetPositionsOwnedResponse }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of Meteora positions owned by the user's wallet",
        tags: ['meteora'],
        querystring: GetPositionsOwnedRequestSchema,
        response: {
          200: GetPositionsOwnedResponseSchema
        }
      }
    },
    async (request) => {
      const { network, address, poolAddress } = request.query;
      const solana = Solana.getInstance(network);
      const meteora = Meteora.getInstance(network);
      return await getPositionsOwnedBy(solana, meteora, poolAddress, address);
    }
  );

  // GET /meteora/active-bin
  fastify.get<{ Querystring: GetActiveBinRequest; Reply: GetActiveBinResponse }>(
    '/active-bin',
    {
      schema: {
        description: 'Get active bin for a Meteora pool',
        tags: ['meteora'],
        querystring: GetActiveBinRequestSchema,
        response: {
          200: GetActiveBinResponseSchema
        }
      }
    },
    async (request) => {
      const { network, poolAddress } = request.query;
      const solana = Solana.getInstance(network);
      const meteora = Meteora.getInstance(network);
      return await getActiveBin(solana, meteora, poolAddress);
    }
  );
};

export default meteoraRoutes; 
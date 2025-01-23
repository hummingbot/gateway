import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Solana } from '../../chains/solana/solana';
import { Meteora } from './meteora';
import { getPositionsOwnedBy, getActiveBin } from './meteora.controllers';

declare module 'fastify' {
  interface FastifySchema {
    swaggerQueryExample?: Record<string, unknown>;
    'x-examples'?: Record<string, unknown>;
  }
}

// Request/Response Schemas
export const GetPositionsOwnedRequestSchema = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
  address: Type.String(),
});

export const GetPositionsOwnedResponseSchema = Type.Object({
  activeBin: Type.Object({
    binId: Type.Number(),
    xAmount: Type.Any(),
    yAmount: Type.Any(),
    price: Type.String(),
    pricePerToken: Type.String(),
    supply: Type.Any(),
    version: Type.Number(),
  }),
  userPositions: Type.Array(Type.Object({
    positionData: Type.Object({
      positionBinData: Type.Array(Type.Object({
        binXAmount: Type.String(),
        binYAmount: Type.String(),
        positionXAmount: Type.String(),
        positionYAmount: Type.String(),
        binId: Type.Number(),
        price: Type.String(),
        pricePerToken: Type.String(),
        binLiquidity: Type.String(),
        positionLiquidity: Type.String(),
      })),
      totalClaimedFeeYAmount: Type.Any(),
    }),
    publicKey: Type.Any(),
    version: Type.Any(),
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
        },
        swaggerQueryExample: {
          network: 'mainnet-beta',
          poolAddress: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz',
          address: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5'
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
        },
        swaggerQueryExample: {
          network: 'mainnet-beta',
          poolAddress: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'
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
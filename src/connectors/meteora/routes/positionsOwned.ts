import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { PublicKey } from '@solana/web3.js';
import { DecimalUtil } from '@orca-so/common-sdk';
import { convertDecimals } from '../../../services/base';
import { logger } from '../../../services/logger';

// Schema definitions
const GetPositionsOwnedRequest = Type.Object({
  network: Type.String({ default: 'mainnet-beta' }),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
  address: Type.String({ default: '<your-wallet-address>' }),
});

const GetPositionsOwnedResponse = Type.Object({
  activeBin: Type.Object({
    binId: Type.Number(),
    xAmount: Type.String(),
    yAmount: Type.String(),
    price: Type.Number(),
    pricePerToken: Type.Number(),
  }),
  userPositions: Type.Array(Type.Object({
    publicKey: Type.String(),
    positionData: Type.Object({
      positionBinData: Type.Array(Type.Object({
        binId: Type.Number(),
        binXAmount: Type.String(),
        binYAmount: Type.String(),
        positionXAmount: Type.String(),
        positionYAmount: Type.String(),
      })),
      totalXAmount: Type.String(),
      totalYAmount: Type.String(),
      feeX: Type.String(),
      feeY: Type.String(),
      rewardOne: Type.String(),
      rewardTwo: Type.String(),
      lastUpdatedAt: Type.String(),
    }),
  })),
});

type GetPositionsOwnedRequestType = Static<typeof GetPositionsOwnedRequest>;
type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

const transformPositionsResponse = (dlmmPool: any, activeBin: any, userPositions: any[]): GetPositionsOwnedResponseType => {
  const { tokenX, tokenY } = dlmmPool;
  
  return {
    activeBin: {
      binId: activeBin.binId,
      xAmount: convertDecimals(activeBin.xAmount, tokenX.decimal),
      yAmount: convertDecimals(activeBin.yAmount, tokenY.decimal),
      price: Number(activeBin.price),
      pricePerToken: Number(activeBin.pricePerToken),
    },
    userPositions: userPositions.map(({ publicKey, positionData }) => ({
      publicKey: publicKey.toString(),
      positionData: {
        positionBinData: positionData.positionBinData.map(bin => ({
          binId: bin.binId,
          binXAmount: convertDecimals(bin.binXAmount, tokenX.decimal),
          binYAmount: convertDecimals(bin.binYAmount, tokenY.decimal),
          positionXAmount: convertDecimals(bin.positionXAmount, tokenX.decimal),
          positionYAmount: convertDecimals(bin.positionYAmount, tokenY.decimal),
        })),
        totalXAmount: convertDecimals(positionData.totalXAmount, tokenX.decimal),
        totalYAmount: convertDecimals(positionData.totalYAmount, tokenY.decimal),
        feeX: convertDecimals(positionData.feeX, tokenX.decimal),
        feeY: convertDecimals(positionData.feeY, tokenY.decimal),
        rewardOne: convertDecimals(positionData.rewardOne, tokenX.decimal),
        rewardTwo: convertDecimals(positionData.rewardTwo, tokenY.decimal),
        lastUpdatedAt: DecimalUtil.fromBN(positionData.lastUpdatedAt).toString(),
      },
    })),
  };
};

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of Meteora positions owned by the user's wallet",
        tags: ['meteora'],
        querystring: GetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, address, poolAddress } = request.query;
        const meteora = await Meteora.getInstance(network);
        
        const dlmmPool = await meteora.getDlmmPool(poolAddress);
        if (!dlmmPool) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        try {
          new PublicKey(address); // Validate address format
        } catch (error) {
          throw fastify.httpErrors.badRequest(`Invalid wallet address: ${address}`);
        }

        const { activeBin, userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
          new PublicKey(address)
        );

        return transformPositionsResponse(dlmmPool, activeBin, userPositions);
      } catch (e) {
        if (e.statusCode) return e; // Return Fastify formatted errors
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default positionsOwnedRoute; 
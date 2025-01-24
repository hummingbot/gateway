import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { PublicKey } from '@solana/web3.js';
import { DecimalUtil } from '@orca-so/common-sdk';
import { convertDecimals } from '../../../services/base';

// Schema definitions
const GetPositionsOwnedRequest = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
  address: Type.String(),
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

type GetPositionsOwnedRequestType = typeof GetPositionsOwnedRequest['static'];
type GetPositionsOwnedResponseType = typeof GetPositionsOwnedResponse['static'];

const transformPositionsResponse = (dlmmPool: any, activeBin: any, userPositions: any[]) => {
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
        swaggerQueryExample: {
          network: 'mainnet-beta',
          poolAddress: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz',
          address: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5'
        }
      }
    },
    async (request) => {
      const { network, address, poolAddress } = request.query;
      const meteora = Meteora.getInstance(network);
      
      const dlmmPool = await meteora.getDlmmPool(poolAddress);
      const { activeBin, userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
        new PublicKey(address)
      );

      return transformPositionsResponse(dlmmPool, activeBin, userPositions);
    }
  );
};

export default positionsOwnedRoute; 
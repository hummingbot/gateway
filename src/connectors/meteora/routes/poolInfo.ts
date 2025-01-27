import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { logger } from '../../../services/logger';
import { DecimalUtil } from '@orca-so/common-sdk';

// Schema definitions
const GetPoolInfoRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
});

const GetPoolInfoResponse = Type.Object({
  binId: Type.Number(),
  xAmount: Type.String(),
  yAmount: Type.String(),
  price: Type.Number(),
  pricePerToken: Type.Number(),
});

type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;
type GetPoolInfoResponseType = Static<typeof GetPoolInfoResponse>;

const transformPoolInfoResponse = (dlmmPool: any, activeBin: any): GetPoolInfoResponseType => {
  if (!dlmmPool?.tokenX || !dlmmPool?.tokenY) {
    throw new Error('Invalid DLMM pool structure: missing token information');
  }

  return {
    binId: activeBin.binId,
    xAmount: DecimalUtil.fromBN(activeBin.xAmount, dlmmPool.tokenX.decimal).toString(),
    yAmount: DecimalUtil.fromBN(activeBin.yAmount, dlmmPool.tokenY.decimal).toString(),
    price: Number(activeBin.price),
    pricePerToken: Number(activeBin.pricePerToken),
  };
};

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: GetPoolInfoResponseType;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Meteora pool',
        tags: ['meteora'],
        querystring: GetPoolInfoRequest,
        response: {
          200: GetPoolInfoResponse
        },
      }
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';
        
        const meteora = await Meteora.getInstance(network);
        if (!meteora) {
          throw fastify.httpErrors.serviceUnavailable('Meteora service unavailable');
        }
        
        const dlmmPool = await meteora.getDlmmPool(poolAddress);
        if (!dlmmPool) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }
        
        await dlmmPool.refetchStates();
        const activeBin = await dlmmPool.getActiveBin();
        if (!activeBin) {
          throw fastify.httpErrors.notFound('Active bin not found');
        }

        return transformPoolInfoResponse(dlmmPool, activeBin);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError();
      }
    }
  );
};

export default poolInfoRoute; 
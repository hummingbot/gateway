import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { logger } from '../../../services/logger';
import { DecimalUtil } from '@orca-so/common-sdk';

// Schema definitions
const GetActiveBinRequest = Type.Object({
  network: Type.String({ default: 'mainnet-beta' }),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
});

const GetActiveBinResponse = Type.Object({
  binId: Type.Number(),
  xAmount: Type.String(),
  yAmount: Type.String(),
  price: Type.Number(),
  pricePerToken: Type.Number(),
});

type GetActiveBinRequestType = Static<typeof GetActiveBinRequest>;
type GetActiveBinResponseType = Static<typeof GetActiveBinResponse>;

const transformActiveBinResponse = (dlmmPool: any, activeBin: any): GetActiveBinResponseType => {
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

export const activeBinRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetActiveBinRequestType;
    Reply: GetActiveBinResponseType;
  }>(
    '/active-bin',
    {
      schema: {
        description: 'Get active bin for a Meteora pool',
        tags: ['meteora'],
        querystring: GetActiveBinRequest,
        response: {
          200: GetActiveBinResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, poolAddress } = request.query;
        
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

        return transformActiveBinResponse(dlmmPool, activeBin);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError();
      }
    }
  );
};

export default activeBinRoute; 
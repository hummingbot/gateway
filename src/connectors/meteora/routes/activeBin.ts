import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { convertDecimals } from '../../../services/base';
import { logger } from '../../../services/logger';

// Schema definitions
const GetActiveBinRequest = Type.Object({
  network: Type.String(),
  poolAddress: Type.String(),
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
  const { tokenX, tokenY } = dlmmPool;
  
  return {
    binId: activeBin.binId,
    xAmount: convertDecimals(activeBin.xAmount, tokenX.decimal),
    yAmount: convertDecimals(activeBin.yAmount, tokenY.decimal),
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
        swaggerQueryExample: {
          network: 'mainnet-beta',
          poolAddress: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz'
        }
      }
    },
    async (request) => {
      try {
        const { network, poolAddress } = request.query;
        const meteora = await Meteora.getInstance(network);
        
        const dlmmPool = await meteora.getDlmmPool(poolAddress);
        if (!dlmmPool) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        const activeBin = dlmmPool.getActiveBin();
        return transformActiveBinResponse(dlmmPool, activeBin);
      } catch (e) {
        if (e.statusCode) return e; // Return Fastify formatted errors
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default activeBinRoute; 
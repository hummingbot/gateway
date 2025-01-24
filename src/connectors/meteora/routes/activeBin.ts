import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { convertDecimals } from '../../../services/base';

declare module 'fastify' {
  interface FastifySchema {
    swaggerQueryExample?: Record<string, unknown>;
    'x-examples'?: Record<string, unknown>;
  }
}

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

type GetActiveBinRequestType = typeof GetActiveBinRequest['static'];
type GetActiveBinResponseType = typeof GetActiveBinResponse['static'];

const transformActiveBinResponse = (dlmmPool: any, activeBin: any) => {
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
      const { network, poolAddress } = request.query;
      const meteora = Meteora.getInstance(network);
      
      const dlmmPool = await meteora.getDlmmPool(poolAddress);
      const activeBin = await dlmmPool.getActiveBin();

      return transformActiveBinResponse(dlmmPool, activeBin);
    }
  );
};

export default activeBinRoute; 
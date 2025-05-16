import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../../services/logger';
import {
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../schemas/trading-types/amm-schema';

const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: '',
        tags: [''],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: { type: 'string', examples: [''] },
            percentageToRemove: { type: 'number', examples: [100] },
          },
        },
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (_) => {
      try {
        throw fastify.httpErrors.internalServerError('Not implemented !');
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

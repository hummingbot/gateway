import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { logger } from '../../../services/logger';
import { PositionInfoSchema } from '../../../services/common-interfaces';

const PositionInfoRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  positionAddress: Type.String(),
});

const PositionInfoResponse = PositionInfoSchema;

type PositionInfoRequestType = Static<typeof PositionInfoRequest>;
type PositionInfoResponseType = Static<typeof PositionInfoResponse>;

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: PositionInfoRequestType;
    Reply: PositionInfoResponseType;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get details for a specific Meteora position',
        tags: ['meteora'],
        querystring: PositionInfoRequest,
        response: {
          200: PositionInfoResponse
        },
      }
    },
    async (request) => {
      try {
        const { positionAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';

        const meteora = await Meteora.getInstance(network);
        const position = await meteora.getPosition(positionAddress);
        return position;
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default positionInfoRoute;
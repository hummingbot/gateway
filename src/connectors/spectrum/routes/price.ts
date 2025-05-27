import { FastifyPluginAsync } from 'fastify';
import { Spectrum } from '../spectrum';
import { validatePriceRequest } from '../../connector.validators';
import {
  PriceRequest,
  PriceRequestSchema,
  PriceResponse,
  PriceResponseSchema,
} from '../../connector.requests';

export const priceRoute: FastifyPluginAsync = async (fastify) => {
  // POST /spectrum/amm/estimateTrade
  fastify.post<{ Body: PriceRequest; Reply: PriceResponse }>(
    '/price',
    {
      schema: {
        description: 'Get spectrum price quote',
        tags: ['spectrum/amm'],
        body: PriceRequestSchema,
        response: {
          200: PriceResponseSchema,
        },
      },
    },
    async (request) => {
      validatePriceRequest(request.body);
      const connector: Spectrum = Spectrum.getInstance(
        request.body.chain,
        request.body.network,
      );
      return await connector.estimateTrade(request.body);
    },
  );
};

export default priceRoute;

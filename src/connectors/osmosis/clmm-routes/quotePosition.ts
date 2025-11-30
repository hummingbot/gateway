import { FastifyPluginAsync } from 'fastify';

import {
  QuotePositionRequestType,
  QuotePositionRequest,
  QuotePositionResponseType,
  QuotePositionResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Osmosis } from '../osmosis';

const BASE_TOKEN_AMOUNT = 0.001;
const QUOTE_TOKEN_AMOUNT = 3;
const LOWER_PRICE_BOUND = 2000;
const UPPER_PRICE_BOUND = 4000;
const POOL_ADDRESS_EXAMPLE = 'osmo1rdm79d008fel4ppkgdcf8pgjwazf72sjfhpyx5kpzlck86slpjusek2en6';

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuotePositionRequestType;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Get a quote for opening a position on Osmosis CL',
        tags: ['/connector/osmosis'],
        querystring: {
          ...QuotePositionRequest,
          properties: {
            ...QuotePositionRequest.properties,
            network: { type: 'string', default: 'base', examples: ['base'] },
            lowerPrice: { type: 'number', examples: [LOWER_PRICE_BOUND] },
            upperPrice: { type: 'number', examples: [UPPER_PRICE_BOUND] },
            poolAddress: {
              type: 'string',
              default: POOL_ADDRESS_EXAMPLE,
              examples: [POOL_ADDRESS_EXAMPLE],
            },
            baseTokenAmount: { type: 'number', examples: [BASE_TOKEN_AMOUNT] },
            quoteTokenAmount: { type: 'number', examples: [QUOTE_TOKEN_AMOUNT] },
          },
        },
        response: {
          200: QuotePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, lowerPrice, upperPrice, poolAddress, baseTokenAmount, quoteTokenAmount } = request.query;

        const networkToUse = network;
        // Validate essential parameters
        if (
          !lowerPrice ||
          !upperPrice ||
          !poolAddress ||
          (baseTokenAmount === undefined && quoteTokenAmount === undefined)
        ) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get osmosis and cosmos instances
        const osmosis = await Osmosis.getInstance(networkToUse);
        return await osmosis.QuotePositionCLMM(request.query);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quotePositionRoute;

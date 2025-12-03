import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { QuotePositionResponseType, QuotePositionResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { quotePosition as getQuotePosition } from '../orca.utils';
import { OrcaClmmQuotePositionRequest } from '../schemas';

export async function quotePosition(
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = 1,
): Promise<QuotePositionResponseType> {
  const orca = await Orca.getInstance(network);

  // Validate price range
  if (lowerPrice >= upperPrice) {
    throw httpErrors.badRequest('lowerPrice must be less than upperPrice');
  }

  if (lowerPrice <= 0 || upperPrice <= 0) {
    throw httpErrors.badRequest('Prices must be positive');
  }

  // If neither amount is specified, return an error
  if (!baseTokenAmount && !quoteTokenAmount) {
    throw httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be specified');
  }

  // Get quote from utility method
  const quote = await getQuotePosition(
    orca.solanaKitRpc,
    poolAddress,
    lowerPrice,
    upperPrice,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  return quote;
}

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof OrcaClmmQuotePositionRequest>;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Quote amounts for a new Orca CLMM position',
        tags: ['/connector/orca'],
        querystring: OrcaClmmQuotePositionRequest,
        response: {
          200: QuotePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.query;

        return await quotePosition(
          network,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quotePositionRoute;

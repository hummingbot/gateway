import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponseType, QuotePositionResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmQuotePositionRequest } from '../schemas';
import { quotePosition as sdkQuotePosition } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/quote-position';

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof RaydiumClmmQuotePositionRequest>;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Quote amounts for a new Raydium CLMM position',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmQuotePositionRequest,
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

        const raydium = await Raydium.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Call SDK operation
        const result = await sdkQuotePosition(raydium, solana, {
          network,
          poolAddress,
          lowerPrice,
          upperPrice,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        });

        // Return only fields expected by API schema
        return {
          baseLimited: result.baseLimited,
          baseTokenAmount: result.baseTokenAmount,
          quoteTokenAmount: result.quoteTokenAmount,
          baseTokenAmountMax: result.baseTokenAmountMax,
          quoteTokenAmountMax: result.quoteTokenAmountMax,
          liquidity: result.liquidity,
        };
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quotePositionRoute;

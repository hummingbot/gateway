import { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import {
  MetaDaoQuoteSwapRequest,
  MetaDaoQuoteSwapRequestType,
  MetaDaoQuoteSwapResponse,
  MetaDaoQuoteSwapResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { findDaoByBaseToken } from '../dao-lookup';
import { MetaDao } from '../metadao';

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoQuoteSwapRequestType;
    Reply: MetaDaoQuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a quote for spot market swap on MetaDAO',
        tags: ['/connector/metadao'],
        querystring: MetaDaoQuoteSwapRequest,
        response: {
          200: MetaDaoQuoteSwapResponse,
        },
      },
    },
    async (request): Promise<MetaDaoQuoteSwapResponseType> => {
      const { baseToken, quoteToken = 'USDC', amount, side, slippagePct = 0.5 } = request.query;
      const network = request.query.network || 'mainnet-beta';

      try {
        // Look up DAO by baseToken and quoteToken
        const daoAddress = findDaoByBaseToken(baseToken, quoteToken);
        if (!daoAddress) {
          throw fastify.httpErrors.notFound(`No pool found for baseToken: ${baseToken}, quoteToken: ${quoteToken}`);
        }

        const metadao = await MetaDao.getInstance(network);

        // Fetch DAO account
        const daoAccount = await metadao.getDao(daoAddress);
        const baseMint = daoAccount.baseMint.toString();
        const quoteMint = daoAccount.quoteMint.toString();

        // Get token decimals
        const baseDecimals = await metadao.getTokenDecimals(baseMint);
        const quoteDecimals = await metadao.getTokenDecimals(quoteMint);

        // Get spot pool
        const spotPool = metadao.getSpotPool(daoAccount);

        const slippageMultiplier = 1 - slippagePct / 100;
        const maxSlippageMultiplier = 1 + slippagePct / 100;
        const rawBaseAmount = metadao.toRawAmount(amount, baseDecimals);

        let tokenIn = baseMint;
        let tokenOut = quoteMint;
        let rawAmountIn = rawBaseAmount;
        let rawAmountOut = metadao.calculateSwapOutput(
          rawAmountIn,
          spotPool.baseReserves,
          spotPool.quoteReserves,
          daoAccount.protocolFeeBps,
          daoAccount.lpFeeBps,
        ).output;
        let amountIn = amount;
        let amountOut = metadao.fromRawAmount(rawAmountOut, quoteDecimals);
        let minAmountOut = amountOut * slippageMultiplier;
        let maxAmountIn = amount;
        let priceImpactPct = metadao.calculateSwapOutput(
          rawAmountIn,
          spotPool.baseReserves,
          spotPool.quoteReserves,
          daoAccount.protocolFeeBps,
          daoAccount.lpFeeBps,
        ).priceImpact;

        if (side === 'BUY') {
          tokenIn = quoteMint;
          tokenOut = baseMint;
          rawAmountOut = rawBaseAmount;
          rawAmountIn = metadao.calculateSwapInputForOutput(
            rawAmountOut,
            spotPool.quoteReserves,
            spotPool.baseReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          );
          const quoteResult = metadao.calculateSwapOutput(
            rawAmountIn,
            spotPool.quoteReserves,
            spotPool.baseReserves,
            daoAccount.protocolFeeBps,
            daoAccount.lpFeeBps,
          );
          amountIn = metadao.fromRawAmount(rawAmountIn, quoteDecimals);
          amountOut = amount;
          minAmountOut = amount;
          maxAmountIn = amountIn * maxSlippageMultiplier;
          priceImpactPct = quoteResult.priceImpact;
        }

        // Price is always quote per base
        const price =
          side === 'SELL'
            ? amountIn > 0
              ? amountOut / amountIn
              : 0 // SELL base -> get quote
            : amountOut > 0
              ? amountIn / amountOut
              : 0; // BUY base <- pay quote

        // Generate quote ID and cache
        const quoteId = uuidv4();
        quoteCache.set(quoteId, {
          daoAddress,
          side,
          amount,
          amountIn,
          amountOut,
          minAmountOut,
          maxAmountIn,
          rawInputAmount: rawAmountIn.toString(),
          rawOutputAmount: rawAmountOut.toString(),
          inputDecimals: side === 'BUY' ? quoteDecimals : baseDecimals,
          outputDecimals: side === 'BUY' ? baseDecimals : quoteDecimals,
        });

        const response: MetaDaoQuoteSwapResponseType = {
          quoteId,
          pool: daoAddress,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          price,
          priceImpactPct,
          minAmountOut,
          maxAmountIn,
          fee: {
            lpFeeBps: daoAccount.lpFeeBps,
            protocolFeeBps: daoAccount.protocolFeeBps,
            totalFeeBps: daoAccount.lpFeeBps + daoAccount.protocolFeeBps,
          },
          poolReserves: {
            base: metadao.fromRawAmount(spotPool.baseReserves, baseDecimals),
            quote: metadao.fromRawAmount(spotPool.quoteReserves, quoteDecimals),
            baseRaw: spotPool.baseReserves.toString(),
            quoteRaw: spotPool.quoteReserves.toString(),
          },
        };

        return response;
      } catch (error) {
        logger.error(`Error getting swap quote for baseToken ${baseToken}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to get swap quote: ${error}`);
      }
    },
  );
};

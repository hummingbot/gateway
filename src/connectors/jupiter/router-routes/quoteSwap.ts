import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage, sanitizeString } from '../../../services/sanitize';
import { Jupiter } from '../jupiter';
import { JupiterConfig } from '../jupiter.config';
import { JupiterQuoteSwapRequest, JupiterQuoteSwapResponse } from '../schemas';

export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = JupiterConfig.config.slippagePct,
  onlyDirectRoutes?: boolean,
  restrictIntermediateTokens?: boolean,
): Promise<Static<typeof JupiterQuoteSwapResponse>> {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  // Determine input/output based on side
  const inputToken = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const outputToken = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;
  const inputAmount =
    side === 'SELL' ? amount * Math.pow(10, baseTokenInfo.decimals) : amount * Math.pow(10, quoteTokenInfo.decimals);

  logger.info(`Getting quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`);

  let quoteResponse;
  let approximation = false;

  try {
    // Get quote with the appropriate swap mode
    quoteResponse = await jupiter.getQuote(
      inputToken.address,
      outputToken.address,
      inputAmount / Math.pow(10, inputToken.decimals),
      slippagePct,
      onlyDirectRoutes ?? JupiterConfig.config.onlyDirectRoutes,
      restrictIntermediateTokens ?? JupiterConfig.config.restrictIntermediateTokens,
      side === 'BUY' ? 'ExactOut' : 'ExactIn',
    );
  } catch (error) {
    // A BUY is quoted as ExactOut (exact base-token output). Many thin tokens
    // (e.g. pump.fun launches) have no ExactOut route on Jupiter even though
    // ExactIn routes fine. Fall back to an ExactIn approximation: price the
    // requested base amount via the reverse (base -> quote) ExactIn quote, then
    // fetch an executable ExactIn quote that spends that much quote token.
    if (side === 'BUY') {
      try {
        const reverseQuote = await jupiter.getQuote(
          outputToken.address, // base token in
          inputToken.address, // quote token out
          amount,
          slippagePct,
          onlyDirectRoutes ?? JupiterConfig.config.onlyDirectRoutes,
          restrictIntermediateTokens ?? JupiterConfig.config.restrictIntermediateTokens,
          'ExactIn',
        );
        const quoteInEstimate = Number(reverseQuote.outAmount) / Math.pow(10, inputToken.decimals);
        quoteResponse = await jupiter.getQuote(
          inputToken.address, // quote token in
          outputToken.address, // base token out
          quoteInEstimate,
          slippagePct,
          onlyDirectRoutes ?? JupiterConfig.config.onlyDirectRoutes,
          restrictIntermediateTokens ?? JupiterConfig.config.restrictIntermediateTokens,
          'ExactIn',
        );
        approximation = true;
        logger.info(
          `ExactOut route unavailable for ${outputToken.symbol}; used ExactIn approximation ` +
            `(~${quoteInEstimate} ${inputToken.symbol} in).`,
        );
      } catch (fallbackError) {
        const tokenPair = `${sanitizeString(baseToken)} -> ${sanitizeString(quoteToken)}`;
        const msg = fallbackError?.message || String(fallbackError);
        throw httpErrors.noRouteFound(`No route found for ${tokenPair} (ExactOut, ExactIn fallback failed). ${msg}`);
      }
    } else {
      // Pass through Jupiter's error with context
      const errorMessage = error?.message || String(error);
      const tokenPair = `${sanitizeString(baseToken)} -> ${sanitizeString(quoteToken)}`;
      throw httpErrors.noRouteFound(`No route found for ${tokenPair} (ExactIn). ${errorMessage}`);
    }
  }

  if (!quoteResponse) {
    throw httpErrors.noRouteFound('No routes found for this swap');
  }

  const bestRoute = quoteResponse;
  const estimatedAmountIn = Number(quoteResponse.inAmount) / Math.pow(10, inputToken.decimals);
  const estimatedAmountOut = Number(quoteResponse.outAmount) / Math.pow(10, outputToken.decimals);

  // A normal ExactOut BUY delivers the exact requested base amount; a SELL or an
  // ExactIn BUY approximation delivers an estimated output that slippage bounds.
  const outputIsExact = side === 'BUY' && !approximation;

  // Calculate min/max amounts based on slippage
  const minAmountOut = outputIsExact ? amount : estimatedAmountOut * (1 - slippagePct / 100);
  const maxAmountIn =
    side === 'SELL' ? amount : approximation ? estimatedAmountIn : estimatedAmountIn * (1 + slippagePct / 100);

  // Calculate price based on side (quote per base)
  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Generate quote ID and cache the entire quote response
  const quoteId = uuidv4();

  quoteCache.set(quoteId, bestRoute, {
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    inputToken,
    outputToken,
  });

  return {
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: outputIsExact ? amount : estimatedAmountOut,
    price,
    priceImpactPct: parseFloat(quoteResponse.priceImpactPct || '0'),
    minAmountOut,
    maxAmountIn,
    approximation,
    // Jupiter-specific fields
    quoteResponse: {
      inputMint: inputToken.address,
      inAmount: quoteResponse.inAmount,
      outputMint: outputToken.address,
      outAmount: quoteResponse.outAmount,
      otherAmountThreshold: quoteResponse.otherAmountThreshold || '0',
      swapMode: quoteResponse.swapMode || 'ExactIn',
      slippageBps: quoteResponse.slippageBps,
      priceImpactPct: quoteResponse.priceImpactPct || '0',
      routePlan: quoteResponse.routePlan || [],
      contextSlot: quoteResponse.contextSlot,
      timeTaken: quoteResponse.timeTaken,
    },
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof JupiterQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get an executable swap quote from Jupiter',
        tags: ['/connector/jupiter'],
        querystring: JupiterQuoteSwapRequest,
        response: { 200: JupiterQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          onlyDirectRoutes,
          restrictIntermediateTokens,
        } = request.query as typeof JupiterQuoteSwapRequest._type;

        return await quoteSwap(
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          onlyDirectRoutes,
          restrictIntermediateTokens,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error getting quote:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

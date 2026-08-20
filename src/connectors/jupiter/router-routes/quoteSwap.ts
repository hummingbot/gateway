import { Static } from '@sinclair/typebox';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage, sanitizeString } from '../../../services/sanitize';
import { approximateBuyViaSellLeg, attemptedRoute, priceImpactPercentFromFraction } from '../../router-utils';
import { Jupiter } from '../jupiter';
import { JupiterConfig } from '../jupiter.config';
import { JupiterQuoteSwapResponse } from '../schemas';
export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = JupiterConfig.config.slippagePct,
  approximateIfNoExactOut: boolean = true,
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

  // Routing policy comes from the connector config (conf/connectors/jupiter.yml),
  // not per-request parameters.
  const effectiveOnlyDirectRoutes = JupiterConfig.config.onlyDirectRoutes;
  const effectiveRestrictIntermediateTokens = JupiterConfig.config.restrictIntermediateTokens;

  let quoteResponse;
  let approximation = false;

  try {
    // Get quote with the appropriate swap mode
    quoteResponse = await jupiter.getQuote(
      inputToken.address,
      outputToken.address,
      inputAmount / Math.pow(10, inputToken.decimals),
      slippagePct,
      effectiveOnlyDirectRoutes,
      effectiveRestrictIntermediateTokens,
      side === 'BUY' ? 'ExactOut' : 'ExactIn',
    );
  } catch (error) {
    const errorMessage = error?.message || String(error);

    // Throttling is not a routing failure. Propagate the 429 as-is instead of
    // relabelling it NO_ROUTE_FOUND (which reads as "this token is untradable"
    // and has caused callers to blacklist perfectly good pools). Also skip the
    // ExactIn fallback below - it would just burn another rate-limited request.
    if (error?.code === 'RATE_LIMITED' || error?.statusCode === 429) {
      throw error;
    }

    // A BUY is quoted as ExactOut (exact base-token output). Many thin tokens
    // (e.g. pump.fun launches) have no ExactOut route on Jupiter even though
    // ExactIn routes fine. Approximate via a sell-leg ExactIn quote (shared router
    // behavior, controlled by approximateIfNoExactOut).
    if (side === 'BUY' && approximateIfNoExactOut) {
      try {
        const approximated = await approximateBuyViaSellLeg({
          getExactInQuote: async (inputTokenInfo, outputTokenInfo, amountRaw) => {
            const quote = await jupiter.getQuote(
              inputTokenInfo.address,
              outputTokenInfo.address,
              Number(amountRaw) / Math.pow(10, inputTokenInfo.decimals),
              slippagePct,
              effectiveOnlyDirectRoutes,
              effectiveRestrictIntermediateTokens,
              'ExactIn',
            );
            return { inAmount: quote.inAmount, outAmount: quote.outAmount, quote };
          },
          baseToken: baseTokenInfo,
          quoteToken: quoteTokenInfo,
          baseAmount: amount,
        });
        quoteResponse = approximated.forwardQuote.quote;
        approximation = true;
      } catch (fallbackError) {
        const msg = fallbackError?.message || String(fallbackError);
        const route = attemptedRoute(
          side,
          sanitizeString(baseToken),
          sanitizeString(quoteToken),
          'ExactOut, ExactIn fallback failed',
        );
        throw httpErrors.noRouteFound(`No route found for ${route}. ${msg}`);
      }
    } else {
      // Pass through Jupiter's error, naming the route that was actually attempted. This
      // branch serves a failed SELL and a BUY that declined approximation, and the two
      // are quoted in opposite directions and opposite modes.
      const route = attemptedRoute(side, sanitizeString(baseToken), sanitizeString(quoteToken));
      throw httpErrors.noRouteFound(`No route found for ${route}. ${errorMessage}`);
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
    priceImpactPct: priceImpactPercentFromFraction(quoteResponse.priceImpactPct),
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
      // Jupiter's own payload, handed back to Jupiter at execution: its fields stay in
      // Jupiter's units. Only the unified field above is normalised to a percentage.
      priceImpactPct: quoteResponse.priceImpactPct || '0',
      routePlan: quoteResponse.routePlan || [],
      contextSlot: quoteResponse.contextSlot,
      timeTaken: quoteResponse.timeTaken,
    },
  };
}

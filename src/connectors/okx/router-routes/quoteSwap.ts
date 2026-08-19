import { Static } from '@sinclair/typebox';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage, sanitizeString } from '../../../services/sanitize';
import { approximateBuyViaSellLeg } from '../../router-utils';
import { Okx, OkxRouterResult } from '../okx';
import { OkxConfig } from '../okx.config';
import { OkxQuoteSwapResponse } from '../schemas';
function priceImpactPct(routerResult: OkxRouterResult): number {
  return parseFloat(routerResult.priceImpactPercent ?? routerResult.priceImpactPercentage ?? '0');
}

export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = OkxConfig.config.slippagePct,
  approximateIfNoExactOut: boolean = true,
): Promise<Static<typeof OkxQuoteSwapResponse>> {
  const solana = await Solana.getInstance(network);
  const okx = await Okx.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  // Determine input/output based on side
  const inputToken = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const outputToken = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;

  logger.info(`Getting OKX quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol} (${side})`);

  // The amount is denominated in base token for both sides
  const baseAmountRaw = Math.floor(amount * Math.pow(10, baseTokenInfo.decimals)).toString();

  let routerResult: OkxRouterResult;
  let isApproximation = false;
  // The executable leg cached for execute-quote (re-fetched with the wallet at execution)
  let executableAmountRaw = baseAmountRaw;
  let executableSwapMode: 'exactIn' | 'exactOut' = side === 'BUY' ? 'exactOut' : 'exactIn';

  try {
    routerResult = await okx.getQuote(inputToken.address, outputToken.address, baseAmountRaw, executableSwapMode);
  } catch (error) {
    const errorMessage = error?.message || String(error);

    // BUY orders OKX cannot serve as exactOut on Solana: approximate via a sell-leg exactIn quote
    if (side === 'BUY' && approximateIfNoExactOut) {
      logger.info(`OKX exactOut quote failed (${errorMessage}); approximating BUY via sell leg`);
      const approximated = await approximateBuyViaSellLeg<OkxRouterResult>({
        getExactInQuote: async (inputTokenInfo, outputTokenInfo, legAmountRaw) => {
          const quote = await okx.getQuote(inputTokenInfo.address, outputTokenInfo.address, legAmountRaw, 'exactIn');
          return { inAmount: quote.fromTokenAmount, outAmount: quote.toTokenAmount, quote };
        },
        baseToken: baseTokenInfo,
        quoteToken: quoteTokenInfo,
        baseAmount: amount,
      });
      routerResult = approximated.forwardQuote.quote;
      executableAmountRaw = approximated.quoteAmountInRaw;
      executableSwapMode = 'exactIn';
      isApproximation = true;
    } else {
      const tokenPair = `${sanitizeString(baseToken)} -> ${sanitizeString(quoteToken)}`;
      throw httpErrors.noRouteFound(`No route found for ${tokenPair} (${executableSwapMode}). ${errorMessage}`);
    }
  }

  if (!routerResult) {
    throw httpErrors.noRouteFound('No routes found for this swap');
  }

  const estimatedAmountIn = Number(routerResult.fromTokenAmount) / Math.pow(10, inputToken.decimals);
  const estimatedAmountOut = Number(routerResult.toTokenAmount) / Math.pow(10, outputToken.decimals);

  // Approximated BUY quotes are exactIn (input fixed, output estimated), so slippage
  // applies to the output rather than the input.
  const minAmountOut = side === 'SELL' || isApproximation ? estimatedAmountOut * (1 - slippagePct / 100) : amount;
  const maxAmountIn = isApproximation
    ? estimatedAmountIn
    : side === 'BUY'
      ? estimatedAmountIn * (1 + slippagePct / 100)
      : amount;

  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Generate quote ID and cache a self-contained quote object. OKX's executable
  // transaction is wallet-bound, so execute-quote re-fetches the route with the
  // executing wallet using these cached parameters.
  const quoteId = uuidv4();
  quoteCache.set(quoteId, {
    connector: 'okx',
    network,
    inputToken,
    outputToken,
    side,
    slippagePct,
    amountRaw: executableAmountRaw,
    swapMode: executableSwapMode,
    routerResult,
    isApproximation,
  });

  return {
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: side === 'SELL' || isApproximation ? estimatedAmountOut : amount,
    price,
    priceImpactPct: priceImpactPct(routerResult),
    minAmountOut,
    maxAmountIn,
    ...(isApproximation ? { approximation: true } : {}),
    routerResult,
  };
}

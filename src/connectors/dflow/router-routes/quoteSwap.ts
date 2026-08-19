import { Static } from '@sinclair/typebox';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage, sanitizeString } from '../../../services/sanitize';
import { approximateBuyViaSellLeg } from '../../router-utils';
import { DFlow, DFlowQuoteResponse } from '../dflow';
import { DFlowConfig } from '../dflow.config';
import { DFlowQuoteSwapResponse } from '../schemas';
export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = DFlowConfig.config.slippagePct,
  approximateIfNoExactOut: boolean = true,
): Promise<Static<typeof DFlowQuoteSwapResponse>> {
  const solana = await Solana.getInstance(network);
  const dflow = await DFlow.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  // Determine input/output based on side
  const inputToken = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const outputToken = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;
  const slippageBps = Math.round(slippagePct * 100);

  logger.info(`Getting DFlow quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol} (${side})`);

  let quoteResponse: DFlowQuoteResponse;
  let isApproximation = false;

  if (side === 'SELL') {
    const amountRaw = Math.floor(amount * Math.pow(10, baseTokenInfo.decimals)).toString();
    try {
      quoteResponse = await dflow.getQuote(inputToken.address, outputToken.address, amountRaw, slippageBps);
    } catch (error) {
      const tokenPair = `${sanitizeString(baseToken)} -> ${sanitizeString(quoteToken)}`;
      throw httpErrors.noRouteFound(`No route found for ${tokenPair} (ExactIn). ${error?.message || error}`);
    }
  } else {
    // DFlow is ExactIn-only (it silently ignores swapMode and quotes ExactIn, verified
    // against the live API), so BUY orders are served via the shared sell-leg approximation
    if (!approximateIfNoExactOut) {
      throw httpErrors.badRequest(
        'DFlow supports ExactIn only: BUY orders require approximateIfNoExactOut=true (approximated via a sell-leg quote) or use side=SELL',
      );
    }
    const approximated = await approximateBuyViaSellLeg<DFlowQuoteResponse>({
      getExactInQuote: async (inputTokenInfo, outputTokenInfo, legAmountRaw) => {
        const quote = await dflow.getQuote(inputTokenInfo.address, outputTokenInfo.address, legAmountRaw, slippageBps);
        return { inAmount: quote.inAmount, outAmount: quote.outAmount, quote };
      },
      baseToken: baseTokenInfo,
      quoteToken: quoteTokenInfo,
      baseAmount: amount,
    });
    quoteResponse = approximated.forwardQuote.quote;
    isApproximation = true;
  }

  if (!quoteResponse) {
    throw httpErrors.noRouteFound('No routes found for this swap');
  }

  const estimatedAmountIn = Number(quoteResponse.inAmount) / Math.pow(10, inputToken.decimals);
  const estimatedAmountOut = Number(quoteResponse.outAmount) / Math.pow(10, outputToken.decimals);

  // SELL and approximated BUY are both ExactIn: input fixed, slippage applies to output
  const minAmountOut = estimatedAmountOut * (1 - slippagePct / 100);
  const maxAmountIn = estimatedAmountIn;

  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Generate quote ID and cache a self-contained quote object (quoteCache returns only
  // the cached value at execute time, so everything needed must live in it)
  const quoteId = uuidv4();
  quoteCache.set(quoteId, {
    connector: 'dflow',
    network,
    inputToken,
    outputToken,
    side,
    slippagePct,
    quoteResponse,
    isApproximation,
  });

  return {
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    priceImpactPct: parseFloat(quoteResponse.priceImpactPct || '0'),
    minAmountOut,
    maxAmountIn,
    ...(isApproximation ? { approximation: true } : {}),
    quoteResponse,
  };
}

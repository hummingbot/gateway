import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { approximateBuyViaSellLeg } from '../../router-utils';
import { Fibrous, FibrousRouteSuccess } from '../fibrous';
import { FibrousConfig } from '../fibrous.config';
import { FibrousQuoteSwapRequest, FibrousQuoteSwapResponse } from '../schemas';

/** Firm quotes are executable for this long before they must be refreshed. */
const QUOTE_TTL_MS = 30000;

async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = FibrousConfig.config.slippagePct,
  indicativePrice: boolean = true,
  takerAddress?: string,
  approximateIfNoExactOut: boolean = true,
): Promise<Static<typeof FibrousQuoteSwapResponse>> {
  const ethereum = await Ethereum.getInstance(network);
  const fibrous = await Fibrous.getInstance(network);

  // Resolve token symbols/addresses to token objects from local token list
  const baseTokenInfo = await ethereum.getToken(baseToken);
  const quoteTokenInfo = await ethereum.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  // Determine input/output based on side. The requested amount is always
  // denominated in the base token.
  const tokenInInfo = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const tokenOutInfo = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;
  const baseAmount = fibrous.parseTokenAmount(amount, baseTokenInfo.decimals);

  // Destination for the swap output; falls back to an example address for quotes
  const walletAddress = takerAddress || (await Ethereum.getWalletAddressExample());

  logger.info(
    `Getting ${indicativePrice ? 'indicative price' : 'firm quote'} for ${amount} ${baseToken} ${side === 'SELL' ? '->' : '<-'} ${quoteToken} on Fibrous/${network}`,
  );

  // The Fibrous EVM API is ExactIn-only, so a SELL maps directly onto the API
  // while a BUY is served via the shared sell-leg approximation.
  let route: FibrousRouteSuccess;
  let isApproximation = false;

  if (side === 'SELL') {
    route = await fibrous.getRoute({
      tokenInAddress: tokenInInfo.address,
      tokenOutAddress: tokenOutInfo.address,
      amount: baseAmount,
      slippagePct,
    });
  } else {
    if (!approximateIfNoExactOut) {
      throw httpErrors.badRequest(
        'Fibrous supports ExactIn only: BUY orders require approximateIfNoExactOut=true (approximated via a sell-leg quote) or use side=SELL',
      );
    }
    const approximated = await approximateBuyViaSellLeg<FibrousRouteSuccess>({
      getExactInQuote: async (inputTokenInfo, outputTokenInfo, legAmountRaw) => {
        const legRoute = await fibrous.getRoute({
          tokenInAddress: inputTokenInfo.address,
          tokenOutAddress: outputTokenInfo.address,
          amount: legAmountRaw,
          slippagePct,
        });
        return { inAmount: legRoute.inputAmount, outAmount: legRoute.outputAmount, quote: legRoute };
      },
      baseToken: baseTokenInfo,
      quoteToken: quoteTokenInfo,
      baseAmount: amount,
    });
    route = approximated.forwardQuote.quote;
    isApproximation = true;
  }

  const estimatedAmountIn = parseFloat(fibrous.formatTokenAmount(route.inputAmount, tokenInInfo.decimals));
  const estimatedAmountOut = parseFloat(fibrous.formatTokenAmount(route.outputAmount, tokenOutInfo.decimals));

  // SELL and approximated BUY are both ExactIn: input fixed, slippage applies to output
  const minAmountOut = estimatedAmountOut * (1 - slippagePct / 100);
  const maxAmountIn = estimatedAmountIn;

  // Price is always expressed as quote token per base token
  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  const priceImpactPct = await fibrous.getPriceImpactPct(route);
  const gasEstimate = fibrous.getGasEstimate(route);

  // Indicative prices are pure price discovery: no calldata, no cached quote.
  if (indicativePrice) {
    return {
      quoteId: 'indicative-price',
      tokenIn: tokenInInfo.address,
      tokenOut: tokenOutInfo.address,
      amountIn: estimatedAmountIn,
      amountOut: estimatedAmountOut,
      price,
      priceImpactPct,
      minAmountOut,
      maxAmountIn,
      gasEstimate,
      routeId: route.routeId,
      route: route.route,
      ...(isApproximation ? { approximation: true } : {}),
    };
  }

  // Firm quote: build the router calldata so it can be executed as-is later.
  const calldata = await fibrous.getCalldata(route, slippagePct, walletAddress);
  const transaction = fibrous.buildSwapTransaction(calldata);

  const quoteId = uuidv4();
  const expirationTime = Date.now() + QUOTE_TTL_MS;

  quoteCache.set(
    quoteId,
    {
      network,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value,
      gasEstimate,
      routerAddress: transaction.to,
      tokenIn: tokenInInfo,
      tokenOut: tokenOutInfo,
      amountIn: route.inputAmount,
      amountOut: route.outputAmount,
      minReceived: calldata.route.min_received,
      expectedAmountIn: estimatedAmountIn,
      expectedAmountOut: estimatedAmountOut,
    },
    {
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
      walletAddress,
    },
  );

  return {
    quoteId,
    tokenIn: tokenInInfo.address,
    tokenOut: tokenOutInfo.address,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    priceImpactPct,
    minAmountOut,
    maxAmountIn,
    expirationTime,
    gasEstimate,
    routeId: route.routeId,
    route: route.route,
    ...(isApproximation ? { approximation: true } : {}),
    allowanceTarget: transaction.to,
    to: transaction.to,
    data: transaction.data,
    value: transaction.value,
  };
}

export { quoteSwap };

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof FibrousQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description:
          'Get a swap quote from Fibrous. Use indicativePrice=true for price discovery only, or false/undefined for executable quotes',
        tags: ['/connector/fibrous'],
        querystring: FibrousQuoteSwapRequest,
        response: { 200: FibrousQuoteSwapResponse },
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
          indicativePrice,
          takerAddress,
          approximateIfNoExactOut,
        } = request.query as typeof FibrousQuoteSwapRequest._type;

        return await quoteSwap(
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          indicativePrice ?? true,
          takerAddress,
          approximateIfNoExactOut ?? true,
        );
      } catch (e: any) {
        if (e.statusCode) throw e;
        logger.error('Error getting Fibrous quote:', e.message || e);

        if (e.message?.includes('Fibrous API Error')) {
          throw httpErrors.badRequest(e.message);
        }

        throw httpErrors.internalServerError(e.message || 'Failed to get quote');
      }
    },
  );
};

export default quoteSwapRoute;

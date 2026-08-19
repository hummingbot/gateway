import { Static } from '@sinclair/typebox';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { approximateBuyViaSellLeg } from '../../router-utils';
import { TitanQuoteSwapResponse } from '../schemas';
import { Titan, TitanSwapResponse } from '../titan';
import { TitanConfig } from '../titan.config';

export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = TitanConfig.config.slippagePct,
  approximateIfNoExactOut: boolean = true,
  walletAddress?: string,
): Promise<Static<typeof TitanQuoteSwapResponse>> {
  const solana = await Solana.getInstance(network);
  const titan = await Titan.getInstance(network);

  // Titan DART quotes are wallet-bound; fall back to the configured default wallet when
  // the caller does not specify one (the unified /trading/router dispatcher omits it)
  const wallet = walletAddress || getSolanaChainConfig().defaultWallet;
  if (!wallet) {
    throw httpErrors.badRequest(
      'Titan quotes are wallet-bound: provide walletAddress or set solana.defaultWallet in the config',
    );
  }

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

  logger.info(`Getting Titan quote for ${amount} ${inputToken.symbol} -> ${outputToken.symbol} (${side})`);

  let swapRoute: TitanSwapResponse;
  let isApproximation = false;

  if (side === 'SELL') {
    const amountRaw = Math.floor(amount * Math.pow(10, baseTokenInfo.decimals)).toString();
    try {
      swapRoute = await titan.getSwapRoute(inputToken.address, outputToken.address, amountRaw, wallet, slippageBps);
    } catch (error) {
      throw httpErrors.noRouteFound(
        `No route found for ${baseTokenInfo.symbol} -> ${quoteTokenInfo.symbol} (ExactIn). ${error?.message || error}`,
      );
    }
  } else {
    // Titan DART is ExactIn-only: BUY orders are served via the shared sell-leg approximation
    if (!approximateIfNoExactOut) {
      throw httpErrors.badRequest(
        'Titan DART supports ExactIn only: BUY orders require approximateIfNoExactOut=true (approximated via a sell-leg quote) or use side=SELL',
      );
    }
    const approximated = await approximateBuyViaSellLeg<TitanSwapResponse>({
      getExactInQuote: async (inputTokenInfo, outputTokenInfo, legAmountRaw) => {
        const route = await titan.getSwapRoute(
          inputTokenInfo.address,
          outputTokenInfo.address,
          legAmountRaw,
          wallet,
          slippageBps,
        );
        return { inAmount: String(route.inputAmount), outAmount: String(route.outputAmount), quote: route };
      },
      baseToken: baseTokenInfo,
      quoteToken: quoteTokenInfo,
      baseAmount: amount,
    });
    swapRoute = approximated.forwardQuote.quote;
    isApproximation = true;
  }

  const estimatedAmountIn = Number(swapRoute.inputAmount) / Math.pow(10, inputToken.decimals);
  const estimatedAmountOut = Number(swapRoute.outputAmount) / Math.pow(10, outputToken.decimals);

  // SELL and approximated BUY are both ExactIn: input fixed, slippage applies to output
  const minAmountOut = estimatedAmountOut * (1 - slippagePct / 100);
  const maxAmountIn = estimatedAmountIn;

  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Cache the wallet-bound swap payload (instructions + ALTs). Execution compiles a fresh
  // V0 transaction from these with a fresh blockhash, so instructions do not expire; the
  // route's minOut is baked in via slippageBps.
  const quoteId = uuidv4();
  quoteCache.set(quoteId, {
    connector: 'titan',
    network,
    wallet,
    inputToken,
    outputToken,
    side,
    slippagePct,
    swapRoute,
    isApproximation,
  });

  return {
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    priceImpactPct: 0,
    minAmountOut,
    maxAmountIn,
    ...(isApproximation ? { approximation: true } : {}),
    wallet,
  };
}

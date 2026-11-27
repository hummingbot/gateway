import { Static } from '@sinclair/typebox';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Helmswap } from '../helmswap';
import { HelmswapApiError, type SwapParams } from '../helmswap-api';
import { HelmswapConfig } from '../helmswap.config';
import { mapHelmQuoteToRouter } from '../map-quote';
import { HelmswapQuoteSwapResponse } from '../schemas';

function nativeSymbolFor(network: string): string {
  if (network === 'bsc') return 'BNB';
  return 'ETH';
}

export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = HelmswapConfig.config.slippagePct,
  indicativePrice: boolean = false,
  takerAddress?: string,
): Promise<Static<typeof HelmswapQuoteSwapResponse>> {
  if (side === 'BUY') {
    throw httpErrors.badRequest(
      'HelmSwap quotes are exact-input only. Use side=SELL; amount is the token you spend.',
    );
  }

  const ethereum = await Ethereum.getInstance(network);
  const helm = await Helmswap.getInstance(network);
  const native = nativeSymbolFor(network);

  const baseTokenInfo = await ethereum.getToken(baseToken);
  const quoteTokenInfo = await ethereum.getToken(quoteToken);
  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  const sellIsNative = baseTokenInfo.symbol === native || baseTokenInfo.address === ethereum.nativeTokenSymbol;
  const buyIsNative = quoteTokenInfo.symbol === native || quoteTokenInfo.address === ethereum.nativeTokenSymbol;
  const sellToken = sellIsNative ? native : baseTokenInfo.address;
  const buyToken = buyIsNative ? native : quoteTokenInfo.address;
  const amountIn = helm.parseTokenAmount(amount, baseTokenInfo.decimals);
  const slippageBps = Helmswap.getSlippageBps(slippagePct);

  const params: SwapParams = {
    chain: helm.chainId,
    tokenIn: sellToken,
    tokenOut: buyToken,
    amountIn,
    slippageBps,
    referrer: helm.referrer,
  };

  logger.info(`Getting HelmSwap quote for ${amount} ${baseToken} -> ${quoteToken} on ${network}`);

  let apiQuote: Record<string, unknown>;
  try {
    apiQuote = await helm.api.quote(params);
  } catch (err) {
    if (err instanceof HelmswapApiError) {
      throw httpErrors.badRequest(err.message);
    }
    throw err;
  }

  const impact = (apiQuote.priceImpact ?? (apiQuote.quote as Record<string, unknown> | undefined)?.priceImpact) as
    | { buildable?: boolean; warning?: string | null }
    | undefined;
  if (impact && impact.buildable === false) {
    throw httpErrors.badRequest(impact.warning || 'HelmSwap refused this route (price impact or exhausted liquidity).');
  }

  let quoteId = 'indicative-price';
  if (!indicativePrice) {
    quoteId = uuidv4();
    quoteCache.set(quoteId, 'helmswap', apiQuote, {
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
      sellToken,
      buyToken,
      baseTokenInfo,
      quoteTokenInfo,
      walletAddress: takerAddress,
      params,
    });
  }

  return mapHelmQuoteToRouter({
    quoteId,
    quote: apiQuote,
    sellToken,
    buyToken,
    sellDecimals: baseTokenInfo.decimals,
    buyDecimals: quoteTokenInfo.decimals,
    humanAmountIn: amount,
    indicative: indicativePrice,
  });
}

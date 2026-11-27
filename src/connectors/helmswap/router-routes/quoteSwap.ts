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

type ResolvedToken = { symbol: string; address: string; decimals: number };

const NATIVE_DECIMALS = 18;

function isNativeCurrency(token: string, nativeSymbol: string): boolean {
  return token.trim().toUpperCase() === nativeSymbol.toUpperCase();
}

function nativeCurrencyInfo(nativeSymbol: string): ResolvedToken {
  return { symbol: nativeSymbol, address: nativeSymbol, decimals: NATIVE_DECIMALS };
}

/**
 * Native currencies are not in the shipped token lists (`WETH`/`WBNB` are).
 * Resolve them before `getToken()` so ETH/BNB quotes reach HelmSwap, and keep
 * the native symbol as the API token identity rather than the wrapped address.
 */
async function resolveToken(ethereum: Ethereum, token: string): Promise<ResolvedToken | undefined> {
  const nativeSymbol = ethereum.nativeTokenSymbol;
  if (isNativeCurrency(token, nativeSymbol)) {
    return nativeCurrencyInfo(nativeSymbol);
  }
  return ethereum.getToken(token);
}

function apiTokenId(token: ResolvedToken, nativeSymbol: string): string {
  if (isNativeCurrency(token.symbol, nativeSymbol) || isNativeCurrency(token.address, nativeSymbol)) {
    return nativeSymbol;
  }
  return token.address;
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
    throw httpErrors.badRequest('HelmSwap quotes are exact-input only. Use side=SELL; amount is the token you spend.');
  }

  const ethereum = await Ethereum.getInstance(network);
  const helm = await Helmswap.getInstance(network);
  const nativeSymbol = ethereum.nativeTokenSymbol;

  const baseTokenInfo = await resolveToken(ethereum, baseToken);
  const quoteTokenInfo = await resolveToken(ethereum, quoteToken);
  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  const sellToken = apiTokenId(baseTokenInfo, nativeSymbol);
  const buyToken = apiTokenId(quoteTokenInfo, nativeSymbol);
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

import { Static } from '@sinclair/typebox';
import { v4 as uuidv4 } from 'uuid';

import { Solana } from '../../../chains/solana/solana';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { HelmswapApiError, type SwapParams } from '../../helmswap/helmswap-api';
import { mapHelmQuoteToRouter } from '../../helmswap/map-quote';
import { HelmswapSol } from '../helmswap-sol';
import { HelmswapSolConfig } from '../helmswap-sol.config';
import { HelmswapSolQuoteSwapResponse } from '../schemas';

export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = HelmswapSolConfig.config.slippagePct,
  _approximateIfNoExactOut?: boolean,
): Promise<Static<typeof HelmswapSolQuoteSwapResponse>> {
  if (side === 'BUY') {
    throw httpErrors.badRequest('HelmSwap quotes are exact-input only. Use side=SELL; amount is the token you spend.');
  }

  const solana = await Solana.getInstance(network);
  const helm = await HelmswapSol.getInstance(network);

  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);
  if (!baseTokenInfo || !quoteTokenInfo) {
    throw httpErrors.badRequest(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  const params: SwapParams = {
    chain: 'solana',
    tokenIn: baseTokenInfo.address,
    tokenOut: quoteTokenInfo.address,
    amountIn: helm.parseTokenAmount(amount, baseTokenInfo.decimals),
    slippageBps: HelmswapSol.getSlippageBps(slippagePct),
    referrer: helm.referrer,
  };

  logger.info(`Getting HelmSwap Solana quote for ${amount} ${baseToken} -> ${quoteToken}`);

  let apiQuote: Record<string, unknown>;
  try {
    apiQuote = await helm.api.quote(params);
  } catch (err) {
    if (err instanceof HelmswapApiError) {
      throw httpErrors.badRequest(err.message);
    }
    throw err;
  }

  const quoteId = uuidv4();
  quoteCache.set(quoteId, 'helmswap-sol', apiQuote, {
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    inputToken: baseTokenInfo,
    outputToken: quoteTokenInfo,
    params,
  });

  return mapHelmQuoteToRouter({
    quoteId,
    quote: apiQuote,
    sellToken: baseTokenInfo.address,
    buyToken: quoteTokenInfo.address,
    sellDecimals: baseTokenInfo.decimals,
    buyDecimals: quoteTokenInfo.decimals,
    humanAmountIn: amount,
    indicative: false,
  });
}

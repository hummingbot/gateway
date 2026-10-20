import { LiquiditySolanaState } from '@pump-fun/pump-swap-sdk';
import BN from 'bn.js';

import { QuoteLiquidityResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Pump } from '../pump';
import { PumpConfig } from '../pump.config';
import { fromRawAmount, toRawAmount } from '../pump.utils';

export interface PumpLiquidityQuote {
  baseLimited: boolean;
  /** The deposit's exact on-chain args (raw units). */
  lpToken: BN;
  maxBase: BN;
  maxQuote: BN;
  baseDecimals: number;
  quoteDecimals: number;
  quote: QuoteLiquidityResponseType;
}

/**
 * Proportion a deposit to the pool ratio: whichever provided amount buys less
 * liquidity is the limiting side, and the other amount is recomputed from it.
 */
export async function getLiquidityQuote(
  pump: Pump,
  state: LiquiditySolanaState,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number,
): Promise<PumpLiquidityQuote> {
  if (!(baseTokenAmount > 0) || !(quoteTokenAmount > 0)) {
    throw httpErrors.badRequest('baseTokenAmount and quoteTokenAmount must both be positive');
  }

  const baseTokenInfo = await pump.getTokenInfo(state.pool.baseMint.toBase58());
  const quoteTokenInfo = await pump.getTokenInfo(state.pool.quoteMint.toBase58());
  const baseRaw = toRawAmount(baseTokenAmount, baseTokenInfo.decimals);
  const quoteRaw = toRawAmount(quoteTokenAmount, quoteTokenInfo.decimals);

  const fromBase = pump.ammSdk.depositBaseInput(state, baseRaw, slippagePct);
  const baseLimited = fromBase.quote.lte(quoteRaw);

  if (baseLimited) {
    return {
      baseLimited,
      lpToken: fromBase.lpToken,
      maxBase: fromBase.maxBase,
      maxQuote: fromBase.maxQuote,
      baseDecimals: baseTokenInfo.decimals,
      quoteDecimals: quoteTokenInfo.decimals,
      quote: {
        baseLimited,
        baseTokenAmount,
        quoteTokenAmount: fromRawAmount(fromBase.quote, quoteTokenInfo.decimals),
        baseTokenAmountMax: fromRawAmount(fromBase.maxBase, baseTokenInfo.decimals),
        quoteTokenAmountMax: fromRawAmount(fromBase.maxQuote, quoteTokenInfo.decimals),
      },
    };
  }

  const fromQuote = pump.ammSdk.depositQuoteInput(state, quoteRaw, slippagePct);
  return {
    baseLimited,
    lpToken: fromQuote.lpToken,
    maxBase: fromQuote.maxBase,
    maxQuote: fromQuote.maxQuote,
    baseDecimals: baseTokenInfo.decimals,
    quoteDecimals: quoteTokenInfo.decimals,
    quote: {
      baseLimited,
      baseTokenAmount: fromRawAmount(fromQuote.base, baseTokenInfo.decimals),
      quoteTokenAmount,
      baseTokenAmountMax: fromRawAmount(fromQuote.maxBase, baseTokenInfo.decimals),
      quoteTokenAmountMax: fromRawAmount(fromQuote.maxQuote, quoteTokenInfo.decimals),
    },
  };
}

export async function quoteLiquidity(
  network: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = PumpConfig.config.slippagePct,
): Promise<QuoteLiquidityResponseType> {
  const pump = await Pump.getInstance(network);
  const state = await pump.getLiquidityState(poolAddress);
  const { quote } = await getLiquidityQuote(pump, state, baseTokenAmount, quoteTokenAmount, slippagePct);
  return quote;
}

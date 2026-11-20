import { buyBaseInput, buyQuoteInput, sellBaseInput, sellQuoteInput, SwapSolanaState } from '@pump-fun/pump-swap-sdk';
import { TokenInfo } from '@solana/spl-token-registry';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { QuoteSwapResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pump } from '../pump';
import { PumpConfig } from '../pump.config';
import { constantProductPriceImpactPct, fromRawAmount, toRawAmount } from '../pump.utils';

/**
 * A priced PumpSwap trade: the standard quote fields plus the exact on-chain
 * instruction bounds, so execution enforces precisely what was quoted.
 */
export interface PumpSwapQuote {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: number;
  amountOut: number;
  minAmountOut: number;
  maxAmountIn: number;
  price: number;
  priceImpactPct: number;
  /** Which AMM instruction executes this quote, with its exact-amount and bound args (raw units). */
  plan: { instruction: 'buy' | 'sell'; baseAmount: BN; bound: BN };
}

/**
 * Price a swap against a PumpSwap pool. `baseToken` is the side `amount` is
 * denominated in and may be either of the pool's two mints; BUY buys it
 * (exact-out where the math allows), SELL sells it (exact-in).
 */
export async function getPumpSwapQuote(
  pump: Pump,
  state: SwapSolanaState,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number,
): Promise<PumpSwapQuote> {
  const baseTokenInfo = await pump.getTokenInfo(baseToken);
  const poolBase = state.pool.baseMint.toBase58();
  const poolQuote = state.pool.quoteMint.toBase58();

  let counterAddress: string;
  if (baseTokenInfo.address === poolBase) {
    counterAddress = poolQuote;
  } else if (baseTokenInfo.address === poolQuote) {
    counterAddress = poolBase;
  } else {
    throw httpErrors.badRequest(
      sanitizeErrorMessage('Base token {} is not in pool ' + state.poolKey.toBase58(), baseToken),
    );
  }
  const counterTokenInfo = await pump.getTokenInfo(counterAddress);

  const mathArgs = {
    slippage: slippagePct,
    baseReserve: state.poolBaseAmount,
    quoteReserve: state.poolQuoteAmount,
    virtualQuoteReserves: state.pool.virtualQuoteReserves ?? new BN(0),
    globalConfig: state.globalConfig,
    baseMintAccount: state.baseMintAccount,
    baseMint: state.baseMint,
    coinCreator: state.pool.coinCreator,
    creator: state.pool.creator,
    feeConfig: state.feeConfig,
  };

  const amountRaw = toRawAmount(amount, baseTokenInfo.decimals);
  const counterDecimals = counterTokenInfo.decimals;

  let amountIn: number;
  let amountOut: number;
  let minAmountOut: number;
  let maxAmountIn: number;
  let plan: PumpSwapQuote['plan'];
  let poolBaseLegRaw: BN;
  /** Whether the trade removes pool-base tokens from the pool (price moves up). */
  let removesPoolBase: boolean;

  if (baseTokenInfo.address === poolBase) {
    if (side === 'BUY') {
      // Buy an exact amount of the pool's base token.
      const r = buyBaseInput({ base: amountRaw, ...mathArgs });
      amountIn = fromRawAmount(r.uiQuote, counterDecimals);
      amountOut = amount;
      minAmountOut = amount;
      maxAmountIn = fromRawAmount(r.maxQuote, counterDecimals);
      plan = { instruction: 'buy', baseAmount: amountRaw, bound: r.maxQuote };
      poolBaseLegRaw = amountRaw;
      removesPoolBase = true;
    } else {
      // Sell an exact amount of the pool's base token.
      const r = sellBaseInput({ base: amountRaw, ...mathArgs });
      amountIn = amount;
      amountOut = fromRawAmount(r.uiQuote, counterDecimals);
      minAmountOut = fromRawAmount(r.minQuote, counterDecimals);
      maxAmountIn = amount;
      plan = { instruction: 'sell', baseAmount: amountRaw, bound: r.minQuote };
      poolBaseLegRaw = amountRaw;
      removesPoolBase = false;
    }
  } else {
    if (side === 'BUY') {
      // Buy an exact amount of the pool's quote token = sell pool-base for it.
      const r = sellQuoteInput({ quote: amountRaw, ...mathArgs });
      amountIn = fromRawAmount(r.base, counterDecimals);
      amountOut = amount;
      minAmountOut = fromRawAmount(r.minQuote, baseTokenInfo.decimals);
      maxAmountIn = amountIn;
      plan = { instruction: 'sell', baseAmount: r.base, bound: r.minQuote };
      poolBaseLegRaw = r.base;
      removesPoolBase = false;
    } else {
      // Sell an exact amount of the pool's quote token = buy pool-base with it.
      const r = buyQuoteInput({ quote: amountRaw, ...mathArgs });
      amountIn = amount;
      amountOut = fromRawAmount(r.base, counterDecimals);
      minAmountOut = amountOut;
      maxAmountIn = fromRawAmount(r.maxQuote, baseTokenInfo.decimals);
      plan = { instruction: 'buy', baseAmount: r.base, bound: r.maxQuote };
      poolBaseLegRaw = r.base;
      removesPoolBase = true;
    }
  }

  const baseAmountTraded = side === 'BUY' ? amountOut : amountIn;
  const counterAmountTraded = side === 'BUY' ? amountIn : amountOut;

  return {
    tokenIn: side === 'BUY' ? counterTokenInfo : baseTokenInfo,
    tokenOut: side === 'BUY' ? baseTokenInfo : counterTokenInfo,
    amountIn,
    amountOut,
    minAmountOut,
    maxAmountIn,
    price: baseAmountTraded > 0 ? counterAmountTraded / baseAmountTraded : 0,
    priceImpactPct: constantProductPriceImpactPct(
      removesPoolBase ? 'BUY' : 'SELL',
      poolBaseLegRaw,
      state.poolBaseAmount,
    ),
    plan,
  };
}

export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = PumpConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  const pump = await Pump.getInstance(network);
  const state = await pump.getSwapState(new PublicKey(poolAddress), PublicKey.default);
  const quote = await getPumpSwapQuote(pump, state, baseToken, side, amount, slippagePct);

  return {
    poolAddress,
    tokenIn: quote.tokenIn.address,
    tokenOut: quote.tokenOut.address,
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    price: quote.price,
    slippagePct,
    minAmountOut: quote.minAmountOut,
    maxAmountIn: quote.maxAmountIn,
    priceImpactPct: quote.priceImpactPct,
  };
}

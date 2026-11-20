import { SwapMode, getCurrentPoint } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { v4 as uuidv4 } from 'uuid';

import { RouterQuoteSwapResponseType } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { MeteoraDbc } from '../meteora-dbc';
import { MeteoraDbcConfig } from '../meteora-dbc.config';
import { fromRawAmount, priceImpactPct, toRawAmount } from '../meteora-dbc.utils';

/**
 * What executeQuote needs to rebuild this trade with the bounds the caller was
 * quoted. Raw amounts travel as strings — the cache is untyped.
 */
export interface DbcCachedQuote {
  network: string;
  poolAddress: string;
  side: 'BUY' | 'SELL';
  slippagePct: number;
  tokenIn: { address: string; symbol: string };
  tokenOut: { address: string; symbol: string };
  /** True for SELL (base in, quote out). */
  swapBaseForQuote: boolean;
  /** Exact input of the on-chain swap2 instruction (raw units). */
  amountInRaw: string;
  /** The instruction's slippage bound: minimum output (raw units). */
  minAmountOutRaw: string;
  /** A buy that completes the curve fills to the threshold and leaves the rest
   *  of its input with the buyer (DBC's partial fill); every other swap is exact-in. */
  partialFill: boolean;
}

/** What the DBC SDK's exact-in quote throws when the input would buy past the
 *  migration threshold (`getSwapResultFromExactInput`, amountLeft > 0). */
const DBC_PAST_THRESHOLD = 'Insufficient Liquidity';

/**
 * Quote an exact-in swap on a live DBC virtual pool. `baseToken` is the launched
 * token, `quoteToken` its quote currency (the pool config's quote mint). Both sides are
 * exact-in: BUY spends `amount` of the quote token, SELL sells `amount` of the base
 * token — the launch and buyback flows both know what they spend, not what they get.
 */
export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = MeteoraDbcConfig.config.slippagePct,
): Promise<RouterQuoteSwapResponseType> {
  if (!(amount > 0)) {
    throw httpErrors.badRequest('amount must be greater than 0');
  }
  const dbc = await MeteoraDbc.getInstance(network);

  const baseTokenInfo = await dbc.getTokenInfo(baseToken);
  const quoteTokenInfo = await dbc.getTokenInfo(quoteToken);
  const state = await dbc.getPoolByBaseMint(new PublicKey(baseTokenInfo.address));

  if (quoteTokenInfo.address !== state.quoteMint.toBase58()) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage(
        `This DBC pool trades against ${state.quoteMint.toBase58()}; quoteToken {} does not match. ` +
          'Pass the launched token as baseToken and its quote currency as quoteToken.',
        quoteToken,
      ),
    );
  }
  if (state.isMigrated) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage(
        'The DBC pool for {} has migrated to DAMM v2. Trade it through the meteora amm connector ' +
          '(/trading/amm with connector=meteora) instead of meteora-dbc.',
        baseToken,
      ),
    );
  }

  const swapBaseForQuote = side === 'SELL';
  const amountInDecimals = swapBaseForQuote ? state.baseDecimals : state.quoteDecimals;
  const amountOutDecimals = swapBaseForQuote ? state.quoteDecimals : state.baseDecimals;
  const amountIn = toRawAmount(amount, amountInDecimals);
  const currentPoint = await getCurrentPoint(dbc.solana.connection, state.config.activationType);

  const params = {
    virtualPool: state.pool,
    config: state.config,
    swapBaseForQuote,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: state.config.enableFirstSwapWithMinFee !== 0 && state.pool.poolState.hasSwap === 0,
    currentPoint,
    slippageBps: Math.round(slippagePct * 100),
    amountIn,
  };
  const quoteIn = (swapMode: SwapMode.ExactIn | SwapMode.PartialFill) =>
    swapMode === SwapMode.PartialFill
      ? dbc.client.pool.swapQuote2({ ...params, swapMode: SwapMode.PartialFill })
      : dbc.client.pool.swapQuote2({ ...params, swapMode: SwapMode.ExactIn });

  // Exact-in cannot spend past the migration threshold, and the curve's fee comes
  // off the input — so a buy sized to what is left falls short, and one sized over
  // it is refused. A buy that reaches the threshold is therefore a partial fill: it
  // completes the curve and the unspent input stays with the buyer. Otherwise nobody
  // could ever be the buyer that graduates it.
  //
  // The SDK's exact-in quote says "past the threshold" one way: it throws
  // `Insufficient Liquidity` when the input would leave an amount over. Only that
  // is a reason to quote the partial fill; any other failure is the caller's.
  let partialFill = false;
  let quote: ReturnType<typeof quoteIn>;
  try {
    quote = quoteIn(SwapMode.ExactIn);
  } catch (e) {
    if (swapBaseForQuote || (e as Error).message !== DBC_PAST_THRESHOLD) throw e;
    partialFill = true;
    quote = quoteIn(SwapMode.PartialFill);
  }
  if (!swapBaseForQuote && !partialFill && quote.amountLeft.gt(new BN(0))) {
    partialFill = true;
    quote = quoteIn(SwapMode.PartialFill);
  }
  if (quote.amountLeft.gt(new BN(0)) && !partialFill) {
    const spendable = fromRawAmount(amountIn.sub(quote.amountLeft), amountInDecimals);
    throw httpErrors.badRequest(
      `Only about ${spendable} ${baseTokenInfo.symbol} can be sold into this DBC pool; reduce amount.`,
    );
  }
  // What the swap actually spends: all of it, or up to the threshold on a partial fill.
  const spent = amountIn.sub(quote.amountLeft);
  if (spent.isZero() || quote.outputAmount.isZero()) {
    throw httpErrors.badRequest(
      `This DBC pool has completed its curve, so it sells no more ${baseTokenInfo.symbol}; ` +
        'trade it on the pool it migrated to.',
    );
  }
  const spentAmount = fromRawAmount(spent, amountInDecimals);
  if (!quote.minimumAmountOut) {
    throw httpErrors.internalServerError('DBC swapQuote2 returned no minimumAmountOut for an exact-in quote');
  }

  const amountOut = fromRawAmount(quote.outputAmount, amountOutDecimals);
  const minAmountOut = fromRawAmount(quote.minimumAmountOut, amountOutDecimals);
  // Price in quote per base, gross of fees (fees are collected in quote on both sides).
  const price = swapBaseForQuote ? amountOut / spentAmount : spentAmount / amountOut;
  // Fee-free execution price against the pre-trade spot price. Fees come off the quote
  // side: the input on BUY, the output on SELL.
  const fees = quote.tradingFee.add(quote.protocolFee).add(quote.referralFee);
  const feeFreeExecution = swapBaseForQuote
    ? fromRawAmount(quote.outputAmount.add(fees), state.quoteDecimals) / spentAmount
    : fromRawAmount(spent.sub(fees), state.quoteDecimals) / amountOut;

  const quoteId = uuidv4();
  const cached: DbcCachedQuote = {
    network,
    poolAddress: state.poolAddress.toBase58(),
    side,
    slippagePct,
    tokenIn: swapBaseForQuote
      ? { address: baseTokenInfo.address, symbol: baseTokenInfo.symbol }
      : { address: quoteTokenInfo.address, symbol: quoteTokenInfo.symbol },
    tokenOut: swapBaseForQuote
      ? { address: quoteTokenInfo.address, symbol: quoteTokenInfo.symbol }
      : { address: baseTokenInfo.address, symbol: baseTokenInfo.symbol },
    swapBaseForQuote,
    amountInRaw: amountIn.toString(),
    minAmountOutRaw: quote.minimumAmountOut.toString(),
    partialFill,
  };
  quoteCache.set(quoteId, 'meteora-dbc', cached);

  return {
    quoteId,
    tokenIn: cached.tokenIn.address,
    tokenOut: cached.tokenOut.address,
    amountIn: spentAmount,
    amountOut,
    price,
    priceImpactPct: priceImpactPct(dbc.spotPrice(state), feeFreeExecution),
    minAmountOut,
    maxAmountIn: amount,
    slippagePct,
    poolAddress: cached.poolAddress,
  };
}

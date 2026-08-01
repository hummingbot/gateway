import { httpErrors } from '../services/error-handler';
import { logger } from '../services/logger';

/**
 * Minimal token shape needed for BUY approximation (subset of chain TokenInfo).
 */
export interface RouterToken {
  symbol: string;
  address: string;
  decimals: number;
}

/**
 * An ExactIn quote in raw (smallest-unit) amounts, as returned by a router API.
 */
export interface ExactInQuote<TQuote = unknown> {
  /** Raw input amount in smallest units */
  inAmount: string;
  /** Raw expected output amount in smallest units */
  outAmount: string;
  /** The router's native quote payload, passed through for caching/execution */
  quote: TQuote;
}

export interface ApproximateBuyParams<TQuote> {
  /**
   * Fetches an ExactIn quote from the router. Called twice: once for the sell leg
   * (base -> quote) to discover the price, once for the forward leg (quote -> base)
   * to produce the executable quote.
   */
  getExactInQuote: (
    inputToken: RouterToken,
    outputToken: RouterToken,
    amountRaw: string,
  ) => Promise<ExactInQuote<TQuote>>;
  baseToken: RouterToken;
  quoteToken: RouterToken;
  /** Human-readable amount of base token the caller wants to buy */
  baseAmount: number;
}

export interface ApproximateBuyResult<TQuote> {
  /** Raw quote-token input amount for the executable forward quote (smallest units) */
  quoteAmountInRaw: string;
  /** Human-readable quote-token input amount */
  quoteAmountIn: number;
  /** Human-readable estimated base-token output of the forward quote */
  estimatedBaseOut: number;
  /** The executable forward (quote -> base) ExactIn quote from the router */
  forwardQuote: ExactInQuote<TQuote>;
}

/**
 * Approximates a BUY (ExactOut) on a router that only supports ExactIn quotes.
 *
 * 1. Sell leg: quote ExactIn base -> quote for the desired base amount, which implies the
 *    current price for that trade size.
 * 2. Forward leg: quote ExactIn quote -> base spending the sell leg's output, producing an
 *    executable quote whose output is approximately (not exactly) the desired base amount.
 *
 * Callers must surface `approximation: true` in their response so clients know amountOut
 * is an estimate. Costs two router quote calls.
 */
export async function approximateBuyViaSellLeg<TQuote>({
  getExactInQuote,
  baseToken,
  quoteToken,
  baseAmount,
}: ApproximateBuyParams<TQuote>): Promise<ApproximateBuyResult<TQuote>> {
  const baseAmountRaw = Math.floor(baseAmount * 10 ** baseToken.decimals).toString();

  logger.info(
    `Approximating BUY of ${baseAmount} ${baseToken.symbol} via sell-leg quote (router lacks ExactOut support)`,
  );

  // Sell leg: how much quote token does selling the desired base amount yield right now?
  const sellLeg = await getExactInQuote(baseToken, quoteToken, baseAmountRaw);
  const quoteAmountInRaw = sellLeg.outAmount;
  if (!quoteAmountInRaw || Number(quoteAmountInRaw) <= 0) {
    throw httpErrors.badRequest(
      `Cannot approximate BUY: sell-leg quote for ${baseToken.symbol} -> ${quoteToken.symbol} returned no output`,
    );
  }

  // Forward leg: the executable quote, spending that quote amount to buy base.
  const forwardQuote = await getExactInQuote(quoteToken, baseToken, quoteAmountInRaw);
  const estimatedBaseOut = Number(forwardQuote.outAmount) / 10 ** baseToken.decimals;
  if (!forwardQuote.outAmount || estimatedBaseOut <= 0) {
    throw httpErrors.badRequest(
      `Cannot approximate BUY: forward quote for ${quoteToken.symbol} -> ${baseToken.symbol} returned no output`,
    );
  }

  return {
    quoteAmountInRaw,
    quoteAmountIn: Number(quoteAmountInRaw) / 10 ** quoteToken.decimals,
    estimatedBaseOut,
    forwardQuote,
  };
}

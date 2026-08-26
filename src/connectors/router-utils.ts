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
 * A router's price impact as the percentage the schema documents.
 *
 * `QuoteSwapResponse.priceImpactPct` promises "Estimated price impact percentage
 * (0-100)". Jupiter's field of the same name is a decimal *fraction* — 0.0126 means
 * 1.26% — and it was passed through unconverted, so the number was 100x low against its
 * own documentation, in the direction that makes a bad trade look harmless. A guard of
 * the form `if (priceImpactPct > 5) reject` could never fire.
 *
 * Measured on SOL-USDC: a 20,000 SOL sell reported 0.001260 against a 0.134% impact
 * computed from the quoted prices — agreement to within the fee once the trade is large
 * enough for impact to dominate.
 *
 * Applies to the routers that serve Jupiter's quote schema: jupiter itself and dflow,
 * whose quote response is that schema field for field. It does NOT apply to a router's
 * native payload passed back for execution — that has to stay in the router's own units.
 */
export function priceImpactPercentFromFraction(fraction: string | number | undefined | null): number {
  const parsed = parseFloat(String(fraction ?? ''));
  // A router that omits the field reports 0, which is what the call sites' `|| '0'` did
  // before this existed. It is indistinguishable from a measured zero — the field cannot
  // express "not computed" — which is the half of this defect the schema still owes.
  return Number.isFinite(parsed) ? parsed * 100 : 0;
}

/**
 * The route a quote actually attempted, for an error message a caller can act on.
 *
 * A SELL is ExactIn base -> quote; a BUY is ExactOut quote -> base. Every router here
 * built its no-route message from the SELL shape and reused it for both, so a BUY that
 * failed was reported as a failed ExactIn in the opposite direction — naming a route
 * nobody tried. That matters because the message is a NO_ROUTE_FOUND, which reads as
 * "this token is untradable": the same file already carries a fix for mislabelling a
 * failure that way, after callers blacklisted good pools over it. A BUY declining
 * approximation is precisely the case where ExactIn *does* route, since ExactIn is what
 * the approximation would have used.
 *
 * `mode` overrides the side's default for a router whose executable mode differs from the
 * one implied by the side, or to describe a compound attempt.
 */
export function attemptedRoute(
  side: 'BUY' | 'SELL',
  baseTokenName: string,
  quoteTokenName: string,
  mode?: string,
): string {
  const buying = side === 'BUY';
  const from = buying ? quoteTokenName : baseTokenName;
  const to = buying ? baseTokenName : quoteTokenName;
  return `${from} -> ${to} (${mode ?? (buying ? 'ExactOut' : 'ExactIn')})`;
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

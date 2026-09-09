import { BN } from '@coral-xyz/anchor';
import { StrategyType, autoFillXByStrategy, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Decimal } from 'decimal.js';

import { QuotePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';

const toLamports = (amount: number, decimals: number): BN => new BN(DecimalUtil.toBN(new Decimal(amount), decimals));

const fromLamports = (amount: BN, decimals: number): number => Number(amount.toString()) / Math.pow(10, decimals);

/**
 * Quote what a DLMM position of this shape would actually take.
 *
 * The paired amount comes from the SDK's autoFill helpers, which take the active bin,
 * the bin step and the bin range and return what the strategy requires on the other
 * side — the same math the open performs, so the quote describes the position the
 * caller is about to create.
 *
 * It matters most for a range that does not straddle spot: such a position is entirely
 * one-sided, and the unused side is 0. Pricing the paired amount off the range's
 * midpoint instead — as this did — quoted a nonzero amount for a side the position
 * cannot hold, and openPosition rejects exactly that, so following the quote produced
 * a 400 from the open it fed.
 */
export async function quotePosition(
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
  strategyType?: StrategyType,
): Promise<QuotePositionResponseType> {
  try {
    const meteora = await Meteora.getInstance(network);
    const dlmmPool = await meteora.getDlmmPool(poolAddress);

    const baseDecimals = dlmmPool.tokenX.mint.decimals;
    const quoteDecimals = dlmmPool.tokenY.mint.decimals;

    // Derive the bin range exactly as openPosition does — per-lamport prices, and the
    // rounding flags that way round. Passing raw prices with the flags swapped, as this
    // did, described a different bin range than the position would occupy.
    const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
    const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);
    const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true);
    const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false);

    const activeBin = await dlmmPool.getActiveBin();
    const activeId = activeBin.binId;
    const binStep = dlmmPool.lbPair.binStep;
    const strategy = strategyType ?? MeteoraConfig.config.strategyType;
    const amountXInActiveBin = new BN(activeBin.xAmount.toString());
    const amountYInActiveBin = new BN(activeBin.yAmount.toString());

    const slippage = slippagePct / 100;

    /** What the strategy needs on the quote side for a given base amount. */
    const fillQuote = (base: number): number =>
      fromLamports(
        autoFillYByStrategy(
          activeId,
          binStep,
          toLamports(base, baseDecimals),
          amountXInActiveBin,
          amountYInActiveBin,
          minBinId,
          maxBinId,
          strategy,
        ),
        quoteDecimals,
      );

    /** What the strategy needs on the base side for a given quote amount. */
    const fillBase = (quote: number): number =>
      fromLamports(
        autoFillXByStrategy(
          activeId,
          binStep,
          toLamports(quote, quoteDecimals),
          amountXInActiveBin,
          amountYInActiveBin,
          minBinId,
          maxBinId,
          strategy,
        ),
        baseDecimals,
      );

    let baseAmount = 0;
    let quoteAmount = 0;
    let baseLimited = false;

    if (baseTokenAmount && !quoteTokenAmount) {
      baseLimited = true;
      baseAmount = baseTokenAmount;
      quoteAmount = fillQuote(baseTokenAmount);
    } else if (quoteTokenAmount && !baseTokenAmount) {
      baseLimited = false;
      quoteAmount = quoteTokenAmount;
      baseAmount = fillBase(quoteTokenAmount);
    } else if (baseTokenAmount && quoteTokenAmount) {
      // Ask what the offered base would require on the quote side. If that needs more
      // quote than the caller has, the quote side binds; otherwise the base does. This
      // asks the strategy rather than comparing a ratio against spot, which was wrong
      // for any range not centred on the current price.
      const quoteNeeded = fillQuote(baseTokenAmount);
      baseLimited = quoteNeeded <= quoteTokenAmount;

      if (baseLimited) {
        baseAmount = baseTokenAmount;
        quoteAmount = quoteNeeded;
      } else {
        quoteAmount = quoteTokenAmount;
        baseAmount = fillBase(quoteTokenAmount);
      }
    }

    // What opening this range will take. One position spans up to 1400 bins, so
    // `positionCount` stays 1 for any realistic range; the number that actually moves is
    // `transactionCount`, because a deposit is chunked at DEFAULT_BIN_PER_POSITION bins
    // per transaction. Reported so a caller sees a wide range costs several transactions
    // before opening, rather than discovering it from a rejection.
    const { positionCount, transactionCount } = await dlmmPool.quoteCreatePosition({
      strategy: { minBinId, maxBinId, strategyType: strategy },
    });

    // The SDK counts deposit chunks only — ceil(bins / DEFAULT_BIN_PER_POSITION) — and
    // says nothing about creating the position. openPosition sends that as its own
    // transaction whenever the range is chunked, because a full chunk is already sized to
    // fill a transaction and folding the position init in alongside it risks overflowing
    // one. Add it here so the number quoted is the number the open actually sends; below
    // the chunking threshold the position is created and funded together and the SDK's
    // count is already right.
    const chunkedOpen = maxBinId - minBinId + 1 > Meteora.MAX_POSITION_BIN_WIDTH;
    const openTransactionCount = chunkedOpen ? transactionCount + 1 : transactionCount;

    return {
      baseLimited,
      positionCount,
      transactionCount: openTransactionCount,
      baseTokenAmount: baseAmount,
      quoteTokenAmount: quoteAmount,
      baseTokenAmountMax: baseAmount * (1 + slippage),
      quoteTokenAmountMax: quoteAmount * (1 + slippage),
      // No `liquidity`: the geometric mean this used to report collapses to 0 for any
      // one-sided position, which is most of them. The field is optional in the schema
      // and Orca already omits it.
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

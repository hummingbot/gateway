import { getBuySolAmountFromTokenAmount, getSellSolAmountFromTokenAmount } from '@pump-fun/pump-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { v4 as uuidv4 } from 'uuid';

import { RouterQuoteSwapResponseType } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { getPumpSwapQuote } from '../amm-routes/quoteSwap';
import { Pump } from '../pump';
import { PumpConfig } from '../pump.config';
import { constantProductPriceImpactPct, fromRawAmount, toRawAmount } from '../pump.utils';

/**
 * What executeQuote needs to rebuild this trade with the bounds the caller was
 * quoted. Raw amounts travel as strings — the cache is untyped.
 */
export interface PumpCachedQuote {
  network: string;
  venue: 'curve' | 'pool';
  side: 'BUY' | 'SELL';
  slippagePct: number;
  mint: string;
  poolAddress?: string;
  tokenIn: { address: string; symbol: string };
  tokenOut: { address: string; symbol: string };
  /** The exact-side token amount of the on-chain instruction (raw units). */
  baseAmountRaw: string;
  /** The instruction's slippage bound: max cost on BUY, min output on SELL (raw units). */
  boundRaw: string;
  /** Pool venue only: which AMM instruction executes it. */
  poolInstruction?: 'buy' | 'sell';
}

/**
 * Quote a swap for a pump.fun token across its lifecycle: priced on the
 * bonding curve while it is live, and on the token's canonical PumpSwap pool
 * once it graduates. `baseToken` must be the pump token; `quoteToken` must be
 * the curve's quote currency (SOL, or e.g. USDC for v2 curves).
 */
export async function quoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PumpConfig.config.slippagePct,
): Promise<RouterQuoteSwapResponseType> {
  const pump = await Pump.getInstance(network);

  const baseTokenInfo = await pump.getTokenInfo(baseToken);
  const mint = new PublicKey(baseTokenInfo.address);
  const curve = await pump.getCurveState(mint);

  const quoteTokenInfo = await pump.getTokenInfo(quoteToken);
  if (quoteTokenInfo.address !== curve.quoteMint.toBase58()) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage(
        `This pump token trades against ${curve.quoteMint.toBase58()}; quoteToken {} does not match. ` +
          'Pass the pump token as baseToken and its quote currency as quoteToken.',
        quoteToken,
      ),
    );
  }

  const quoteId = uuidv4();
  const slippageBps = Math.round(slippagePct * 100);

  if (curve.graduated) {
    // Graduated: price on the canonical PumpSwap pool.
    const poolAddress = pump.canonicalPoolAddress(mint, curve.quoteMint);
    let state;
    try {
      state = await pump.getSwapState(poolAddress, PublicKey.default);
    } catch (e: any) {
      if (e?.statusCode === 404) {
        // Tokens that completed before 2025-03-20 migrated to Raydium, not PumpSwap.
        throw httpErrors.badRequest(
          sanitizeErrorMessage(
            'Token {} graduated but has no canonical PumpSwap pool — it likely migrated to Raydium ' +
              '(pre-2025 graduation). Trade it through the jupiter router or the raydium connector.',
            baseToken,
          ),
        );
      }
      throw e;
    }
    const poolQuote = await getPumpSwapQuote(pump, state, baseTokenInfo.address, side, amount, slippagePct);

    const cached: PumpCachedQuote = {
      network,
      venue: 'pool',
      side,
      slippagePct,
      mint: baseTokenInfo.address,
      poolAddress: poolAddress.toBase58(),
      tokenIn: { address: poolQuote.tokenIn.address, symbol: poolQuote.tokenIn.symbol },
      tokenOut: { address: poolQuote.tokenOut.address, symbol: poolQuote.tokenOut.symbol },
      baseAmountRaw: poolQuote.plan.baseAmount.toString(),
      boundRaw: poolQuote.plan.bound.toString(),
      poolInstruction: poolQuote.plan.instruction,
    };
    quoteCache.set(quoteId, 'pump', cached);

    return {
      quoteId,
      tokenIn: poolQuote.tokenIn.address,
      tokenOut: poolQuote.tokenOut.address,
      amountIn: poolQuote.amountIn,
      amountOut: poolQuote.amountOut,
      price: poolQuote.price,
      priceImpactPct: poolQuote.priceImpactPct,
      minAmountOut: poolQuote.minAmountOut,
      maxAmountIn: poolQuote.maxAmountIn,
      slippagePct,
    };
  }

  // Live bonding curve. BUY is exact-out (buy `amount` tokens, bounded max cost);
  // SELL is exact-in (sell `amount` tokens, bounded min output).
  const baseRaw = toRawAmount(amount, baseTokenInfo.decimals);
  const curveArgs = {
    global: curve.global,
    feeConfig: curve.feeConfig,
    mintSupply: curve.bondingCurve.tokenTotalSupply,
    bondingCurve: curve.bondingCurve,
    quoteMint: curve.bondingCurve.quoteMint,
  };

  let amountIn: number;
  let amountOut: number;
  let minAmountOut: number;
  let maxAmountIn: number;
  let boundRaw: BN;

  if (side === 'BUY') {
    if (baseRaw.gt(curve.bondingCurve.realTokenReserves)) {
      throw httpErrors.badRequest(
        `Only ${fromRawAmount(curve.bondingCurve.realTokenReserves, baseTokenInfo.decimals)} ` +
          `${baseTokenInfo.symbol} remain on the bonding curve; buying them all graduates the token.`,
      );
    }
    const cost = getBuySolAmountFromTokenAmount({ ...curveArgs, amount: baseRaw });
    boundRaw = cost.muln(10_000 + slippageBps).divn(10_000);
    amountIn = fromRawAmount(cost, quoteTokenInfo.decimals);
    amountOut = amount;
    minAmountOut = amount;
    maxAmountIn = fromRawAmount(boundRaw, quoteTokenInfo.decimals);
  } else {
    const output = getSellSolAmountFromTokenAmount({ ...curveArgs, amount: baseRaw });
    boundRaw = output.muln(10_000 - slippageBps).divn(10_000);
    amountIn = amount;
    amountOut = fromRawAmount(output, quoteTokenInfo.decimals);
    minAmountOut = fromRawAmount(boundRaw, quoteTokenInfo.decimals);
    maxAmountIn = amount;
  }

  const cached: PumpCachedQuote = {
    network,
    venue: 'curve',
    side,
    slippagePct,
    mint: baseTokenInfo.address,
    tokenIn:
      side === 'BUY'
        ? { address: quoteTokenInfo.address, symbol: quoteTokenInfo.symbol }
        : { address: baseTokenInfo.address, symbol: baseTokenInfo.symbol },
    tokenOut:
      side === 'BUY'
        ? { address: baseTokenInfo.address, symbol: baseTokenInfo.symbol }
        : { address: quoteTokenInfo.address, symbol: quoteTokenInfo.symbol },
    baseAmountRaw: baseRaw.toString(),
    boundRaw: boundRaw.toString(),
  };
  quoteCache.set(quoteId, 'pump', cached);

  const quoteSide = side === 'BUY' ? amountIn : amountOut;
  return {
    quoteId,
    tokenIn: cached.tokenIn.address,
    tokenOut: cached.tokenOut.address,
    amountIn,
    amountOut,
    price: amount > 0 ? quoteSide / amount : 0,
    priceImpactPct: constantProductPriceImpactPct(side, baseRaw, curve.bondingCurve.virtualTokenReserves),
    minAmountOut,
    maxAmountIn,
    slippagePct,
  };
}

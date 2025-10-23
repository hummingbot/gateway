/**
 * Raydium CLMM Quote Position
 *
 * Quote operation to calculate token amounts for opening a CLMM position.
 * Determines liquidity and token amounts for a given price range.
 */

import { TickUtils, PoolUtils } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { QuotePositionParams, QuotePositionResult } from '../../types/clmm';

/**
 * Quote CLMM Position
 *
 * Calculates the required token amounts for opening a CLMM position:
 * - Takes price range (lower/upper) and one token amount as input
 * - Calculates the corresponding other token amount
 * - Returns amounts with slippage (max amounts)
 * - Calculates liquidity for the position
 *
 * @param raydium - Raydium connector instance
 * @param solana - Solana chain instance
 * @param params - Quote position parameters
 * @returns Quote with token amounts and liquidity
 */
export async function quotePosition(
  raydium: any, // Will be properly typed as RaydiumConnector
  solana: any,  // Solana chain instance
  params: QuotePositionParams,
): Promise<QuotePositionResult> {
  const { network, poolAddress, lowerPrice, upperPrice, baseTokenAmount, quoteTokenAmount, slippagePct } = params;

  // Get pool info
  const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
  const rpcData = await raydium.getClmmPoolfromRPC(poolAddress);
  poolInfo.price = rpcData.currentPrice;

  // Convert prices to ticks
  const { tick: lowerTick, price: tickLowerPrice } = TickUtils.getPriceAndTick({
    poolInfo,
    price: new Decimal(lowerPrice),
    baseIn: true,
  });
  const { tick: upperTick, price: tickUpperPrice } = TickUtils.getPriceAndTick({
    poolInfo,
    price: new Decimal(upperPrice),
    baseIn: true,
  });

  // Convert amounts to BN
  const baseAmountBN = baseTokenAmount
    ? new BN(new Decimal(baseTokenAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0))
    : undefined;
  const quoteAmountBN = quoteTokenAmount
    ? new BN(new Decimal(quoteTokenAmount).mul(10 ** poolInfo.mintB.decimals).toFixed(0))
    : undefined;

  if (!baseAmountBN && !quoteAmountBN) {
    throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
  }

  const epochInfo = await solana.connection.getEpochInfo();
  const slippage = (slippagePct === 0 ? 0 : slippagePct || 1) / 100;

  // Calculate liquidity for base token amount
  let resBase;
  if (baseAmountBN) {
    resBase = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: slippage,
      inputA: true,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      amount: baseAmountBN,
      add: true,
      amountHasFee: true,
      epochInfo,
    });
  }

  // Calculate liquidity for quote token amount
  let resQuote;
  if (quoteAmountBN) {
    resQuote = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: slippage,
      inputA: false,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      amount: quoteAmountBN,
      add: true,
      amountHasFee: true,
      epochInfo,
    });
  }

  // If both amounts provided, use the one with less liquidity
  let res;
  let baseLimited = false;
  if (resBase && resQuote) {
    const baseLiquidity = Number(resBase.liquidity.toString());
    const quoteLiquidity = Number(resQuote.liquidity.toString());
    baseLimited = baseLiquidity < quoteLiquidity;
    res = baseLimited ? resBase : resQuote;
  } else {
    baseLimited = !!resBase;
    res = resBase || resQuote;
  }

  return {
    baseLimited,
    baseTokenAmount: Number(res.amountA.amount.toString()) / 10 ** poolInfo.mintA.decimals,
    quoteTokenAmount: Number(res.amountB.amount.toString()) / 10 ** poolInfo.mintB.decimals,
    baseTokenAmountMax: Number(res.amountSlippageA.amount.toString()) / 10 ** poolInfo.mintA.decimals,
    quoteTokenAmountMax: Number(res.amountSlippageB.amount.toString()) / 10 ** poolInfo.mintB.decimals,
    tickLower: Math.min(lowerTick, upperTick),
    tickUpper: Math.max(lowerTick, upperTick),
    liquidity: res.liquidity.toString(),
    estimatedApr: undefined, // Optional field
  };
}

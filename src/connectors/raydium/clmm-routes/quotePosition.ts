import { PoolUtils } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { priceToTick } from '../raydium.utils';

export async function quotePosition(
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
  baseTokenSymbol?: string,
  quoteTokenSymbol?: string,
): Promise<QuotePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await Raydium.getInstance(network);

    // If no pool address provided, find default pool using base and quote tokens
    let poolAddressToUse = poolAddress;
    if (!poolAddressToUse) {
      if (!baseTokenSymbol || !quoteTokenSymbol) {
        throw new Error('Either poolAddress or both baseToken and quoteToken must be provided');
      }

      poolAddressToUse = await raydium.findDefaultPool(baseTokenSymbol, quoteTokenSymbol, 'clmm');
      if (!poolAddressToUse) {
        throw new Error(`No CLMM pool found for pair ${baseTokenSymbol}-${quoteTokenSymbol}`);
      }
    }

    const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddressToUse);
    const rpcData = await raydium.getClmmPoolfromRPC(poolAddressToUse);
    poolInfo.price = rpcData.currentPrice;

    const { tickSpacing } = poolInfo.config;
    const lowerTick = priceToTick(
      new Decimal(lowerPrice),
      tickSpacing,
      poolInfo.mintA.decimals,
      poolInfo.mintB.decimals,
    );
    const upperTick = priceToTick(
      new Decimal(upperPrice),
      tickSpacing,
      poolInfo.mintA.decimals,
      poolInfo.mintB.decimals,
    );

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
    const slippage = slippagePct / 100;

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
      console.log('resBase', {
        liquidity: Number(resBase.liquidity.toString()),
        amountA: Number(resBase.amountA.amount.toString()) / 10 ** poolInfo.mintA.decimals,
        amountB: Number(resBase.amountB.amount.toString()) / 10 ** poolInfo.mintB.decimals,
        amountSlippageA: Number(resBase.amountSlippageA.amount.toString()) / 10 ** poolInfo.mintA.decimals,
        amountSlippageB: Number(resBase.amountSlippageB.amount.toString()) / 10 ** poolInfo.mintB.decimals,
        price:
          Number(resBase.amountB.amount.toString()) /
          10 ** poolInfo.mintB.decimals /
          (Number(resBase.amountA.amount.toString()) / 10 ** poolInfo.mintA.decimals),
        priceWithSlippage:
          Number(resBase.amountSlippageB.amount.toString()) /
          10 ** poolInfo.mintB.decimals /
          (Number(resBase.amountSlippageA.amount.toString()) / 10 ** poolInfo.mintA.decimals),
        expirationTime: resBase.expirationTime,
      });
    }

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
      console.log('resQuote', {
        liquidity: Number(resQuote.liquidity.toString()),
        amountA: Number(resQuote.amountA.amount.toString()) / 10 ** poolInfo.mintA.decimals,
        amountB: Number(resQuote.amountB.amount.toString()) / 10 ** poolInfo.mintB.decimals,
        amountSlippageA: Number(resQuote.amountSlippageA.amount.toString()) / 10 ** poolInfo.mintA.decimals,
        amountSlippageB: Number(resQuote.amountSlippageB.amount.toString()) / 10 ** poolInfo.mintB.decimals,
        price:
          Number(resQuote.amountB.amount.toString()) /
          10 ** poolInfo.mintB.decimals /
          (Number(resQuote.amountA.amount.toString()) / 10 ** poolInfo.mintA.decimals),
        priceWithSlippage:
          Number(resQuote.amountSlippageB.amount.toString()) /
          10 ** poolInfo.mintB.decimals /
          (Number(resQuote.amountSlippageA.amount.toString()) / 10 ** poolInfo.mintA.decimals),
        expirationTime: resQuote.expirationTime,
      });
    }

    // The most the position may take of each side: the side the caller fixed is
    // exact, the other one gets the slippage allowance on top. (The SDK's
    // amountSlippage{A,B} are minimums for a withdrawal, below the amount even
    // when `add` is set, so they cannot bound a deposit.)
    const maxAmount = (amount: BN, fixed: boolean): number =>
      Number(
        fixed
          ? amount.toString()
          : new Decimal(amount.toString())
              .mul(1 + slippage)
              .ceil()
              .toFixed(),
      );

    // If both base and quote amounts are provided, use the one with less liquidity
    let res;
    let baseLimited = false;
    if (resBase && resQuote) {
      const baseLiquidity = Number(resBase.liquidity.toString());
      const quoteLiquidity = Number(resQuote.liquidity.toString());
      baseLimited = baseLiquidity < quoteLiquidity;
      res = baseLimited ? resBase : resQuote;
    } else {
      // Otherwise use the one that was calculated
      baseLimited = !!resBase;
      res = resBase || resQuote;
    }

    return {
      baseLimited,
      baseTokenAmount: Number(res.amountA.amount.toString()) / 10 ** poolInfo.mintA.decimals,
      quoteTokenAmount: Number(res.amountB.amount.toString()) / 10 ** poolInfo.mintB.decimals,
      baseTokenAmountMax: maxAmount(res.amountA.amount, baseLimited) / 10 ** poolInfo.mintA.decimals,
      quoteTokenAmountMax: maxAmount(res.amountB.amount, !baseLimited) / 10 ** poolInfo.mintB.decimals,
      liquidity: res.liquidity,
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

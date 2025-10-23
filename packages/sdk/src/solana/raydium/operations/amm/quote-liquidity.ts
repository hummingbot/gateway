/**
 * Raydium AMM Quote Liquidity
 *
 * Quote operation to calculate token amounts for adding liquidity.
 * Handles both standard AMM and CPMM pool types.
 */

import {
  ApiV3PoolInfoStandardItemCpmm,
  ApiV3PoolInfoStandardItem,
  Percent,
  TokenAmount,
} from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { QuoteLiquidityParams, QuoteLiquidityResult, AmmComputePairResult, CpmmComputePairResult } from '../../types/amm';

/**
 * Quote Liquidity Amounts
 *
 * Calculates the required token amounts for adding liquidity:
 * - Takes either base or quote token amount as input
 * - Calculates the corresponding other token amount
 * - Returns amounts with slippage (max amounts)
 * - Handles both AMM and CPMM pool types
 *
 * @param raydium - Raydium connector instance
 * @param solana - Solana chain instance
 * @param params - Quote liquidity parameters
 * @returns Quote with token amounts and limits
 */
export async function quoteLiquidity(
  raydium: any, // Will be properly typed as RaydiumConnector
  solana: any,  // Solana chain instance
  params: QuoteLiquidityParams,
): Promise<QuoteLiquidityResult> {
  const { network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = params;

  const [poolInfo, _poolKeys] = await raydium.getPoolfromAPI(poolAddress);
  const programId = poolInfo.programId;

  // Validate pool type (AMM or CPMM only)
  const validAmm = programId === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK' ||
                   programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
  const validCpmm = programId === 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

  if (!validAmm && !validCpmm) {
    throw new Error('Target pool is not AMM or CPMM pool');
  }

  const baseToken = await solana.getToken(poolInfo.mintA.address);
  const quoteToken = await solana.getToken(poolInfo.mintB.address);

  const baseAmount = baseTokenAmount?.toString() || '0';
  const quoteAmount = quoteTokenAmount?.toString() || '0';

  if (!baseTokenAmount && !quoteTokenAmount) {
    throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
  }

  const epochInfo = await solana.connection.getEpochInfo();
  // Convert percentage to basis points (e.g., 1% = 100 basis points)
  const slippageValue = slippagePct === 0 ? 0 : slippagePct || 1;
  const slippage = new Percent(Math.floor(slippageValue * 100), 10000);

  const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);

  // Compute pair amount for base token input
  let resBase: AmmComputePairResult | CpmmComputePairResult;
  if (ammPoolInfo.poolType === 'amm') {
    resBase = raydium.raydiumSDK.liquidity.computePairAmount({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
      amount: baseAmount,
      baseIn: true,
      slippage: slippage,
    });
  } else if (ammPoolInfo.poolType === 'cpmm') {
    const rawPool = await raydium.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress]);
    resBase = raydium.raydiumSDK.cpmm.computePairAmount({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
      amount: baseAmount,
      baseReserve: new BN(rawPool[poolAddress].baseReserve),
      quoteReserve: new BN(rawPool[poolAddress].quoteReserve),
      slippage: slippage,
      baseIn: true,
      epochInfo: epochInfo,
    });
  }

  // Compute pair amount for quote token input
  let resQuote: AmmComputePairResult | CpmmComputePairResult;
  if (ammPoolInfo.poolType === 'amm') {
    resQuote = raydium.raydiumSDK.liquidity.computePairAmount({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
      amount: quoteAmount,
      baseIn: false,
      slippage: slippage,
    });
  } else if (ammPoolInfo.poolType === 'cpmm') {
    const rawPool = await raydium.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress]);
    resQuote = raydium.raydiumSDK.cpmm.computePairAmount({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
      amount: quoteAmount,
      baseReserve: new BN(rawPool[poolAddress].baseReserve),
      quoteReserve: new BN(rawPool[poolAddress].quoteReserve),
      slippage: slippage,
      baseIn: false,
      epochInfo: epochInfo,
    });
  }

  // Choose the result with lower liquidity (limiting factor)
  // Parse and return based on pool type
  if (ammPoolInfo.poolType === 'amm') {
    const useBaseResult = resBase.liquidity.lte(resQuote.liquidity);
    const ammRes = useBaseResult ? (resBase as AmmComputePairResult) : (resQuote as AmmComputePairResult);
    const isBaseIn = useBaseResult;

    const anotherAmount =
      Number(ammRes.anotherAmount.numerator.toString()) / Number(ammRes.anotherAmount.denominator.toString());
    const maxAnotherAmount =
      Number(ammRes.maxAnotherAmount.numerator.toString()) / Number(ammRes.maxAnotherAmount.denominator.toString());

    if (isBaseIn) {
      return {
        baseLimited: true,
        baseTokenAmount: baseTokenAmount,
        quoteTokenAmount: anotherAmount,
        baseTokenAmountMax: baseTokenAmount,
        quoteTokenAmountMax: maxAnotherAmount,
      };
    } else {
      return {
        baseLimited: false,
        baseTokenAmount: anotherAmount,
        quoteTokenAmount: quoteTokenAmount,
        baseTokenAmountMax: maxAnotherAmount,
        quoteTokenAmountMax: quoteTokenAmount,
      };
    }
  } else if (ammPoolInfo.poolType === 'cpmm') {
    const useBaseResult = resBase.liquidity.lte(resQuote.liquidity);
    const cpmmRes = useBaseResult ? (resBase as CpmmComputePairResult) : (resQuote as CpmmComputePairResult);
    const isBaseIn = useBaseResult;

    const anotherAmount = Number(cpmmRes.anotherAmount.amount.toString());
    const maxAnotherAmount = Number(cpmmRes.maxAnotherAmount.amount.toString());

    if (isBaseIn) {
      return {
        baseLimited: true,
        baseTokenAmount: baseTokenAmount,
        quoteTokenAmount: anotherAmount / 10 ** quoteToken.decimals,
        baseTokenAmountMax: baseTokenAmount,
        quoteTokenAmountMax: maxAnotherAmount / 10 ** quoteToken.decimals,
      };
    } else {
      return {
        baseLimited: false,
        baseTokenAmount: anotherAmount / 10 ** baseToken.decimals,
        quoteTokenAmount: quoteTokenAmount,
        baseTokenAmountMax: maxAnotherAmount / 10 ** baseToken.decimals,
        quoteTokenAmountMax: quoteTokenAmount,
      };
    }
  }

  throw new Error('Unsupported pool type');
}

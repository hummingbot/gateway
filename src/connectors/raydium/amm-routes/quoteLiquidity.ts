import { Percent, TokenAmount } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { QuoteLiquidityResponseType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium, RaydiumAmmPool } from '../raydium';
import { RaydiumConfig } from '../raydium.config';

interface AmmComputePairResult {
  anotherAmount: TokenAmount;
  maxAnotherAmount: TokenAmount;
  liquidity: BN;
}

interface CpmmComputePairResult {
  anotherAmount: { amount: BN };
  maxAnotherAmount: { amount: BN };
  liquidity: BN;
  inputAmountFee: { amount: BN };
}

// cpmm.getPoolInfoFromRpc reports lpAmount in raw units, while computePairAmount reads
// it in whole LP tokens (the API's unit); scale it the way the SDK's own addLiquidity does.
function cpmmComputePoolInfo(pool: Extract<RaydiumAmmPool, { poolType: 'cpmm' }>) {
  return {
    ...pool.poolInfo,
    lpAmount: new Decimal(pool.rpcData.lpAmount.toString()).div(10 ** pool.poolInfo.lpMint.decimals).toNumber(),
  };
}

// liquidity.getPoolInfoFromRpc sets mintAmountA/B to the whole vault balances, which
// still hold the PnL the pool owes out; the program prices deposits on the reserves net
// of it, so computePairAmount is fed those.
function ammComputePoolInfo(pool: Extract<RaydiumAmmPool, { poolType: 'amm' }>) {
  return {
    ...pool.poolInfo,
    mintAmountA: new Decimal(pool.rpcData.baseReserve.toString()).div(10 ** pool.poolInfo.mintA.decimals).toNumber(),
    mintAmountB: new Decimal(pool.rpcData.quoteReserve.toString()).div(10 ** pool.poolInfo.mintB.decimals).toNumber(),
  };
}

// Add helper function to parse values
function parseAmmResult(result: AmmComputePairResult) {
  return {
    anotherAmount:
      Number(result.anotherAmount.numerator.toString()) / Number(result.anotherAmount.denominator.toString()),
    maxAnotherAmount:
      Number(result.maxAnotherAmount.numerator.toString()) / Number(result.maxAnotherAmount.denominator.toString()),
    anotherTokenSymbol: result.anotherAmount.token.symbol,
    liquidity: result.liquidity.toString(),
  };
}

function parseCpmmResult(result: CpmmComputePairResult, tokenDecimals: number) {
  return {
    anotherAmount: Number(result.anotherAmount.amount.toString()) / 10 ** tokenDecimals,
    maxAnotherAmount: Number(result.maxAnotherAmount.amount.toString()) / 10 ** tokenDecimals,
    inputFee: Number(result.inputAmountFee.amount.toString()) / 10 ** tokenDecimals,
    liquidity: result.liquidity.toString(),
  };
}

export async function quoteLiquidity(
  network: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<QuoteLiquidityResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await Raydium.getInstance(network);

    const pool = await raydium.getAmmPoolFromRpc(poolAddress);
    const { poolInfo } = pool;

    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

    const baseAmount = baseTokenAmount.toString();
    const quoteAmount = quoteTokenAmount.toString();

    if (!baseAmount && !quoteAmount) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const epochInfo = await solana.connection.getEpochInfo();
    // Convert percentage to basis points (e.g., 1% = 100 basis points)
    const slippage = new Percent(Math.floor(slippagePct * 100), 10000);

    let resBase: AmmComputePairResult | CpmmComputePairResult;
    if (pool.poolType === 'amm') {
      resBase = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: ammComputePoolInfo(pool),
        amount: baseAmount,
        baseIn: true,
        slippage: slippage, // 1%
      });
      console.log('resBase parsed:', parseAmmResult(resBase as AmmComputePairResult));
    } else {
      resBase = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: cpmmComputePoolInfo(pool),
        amount: baseAmount,
        baseReserve: pool.rpcData.baseReserve,
        quoteReserve: pool.rpcData.quoteReserve,
        slippage: slippage,
        baseIn: true,
        epochInfo: epochInfo,
      });
      console.log('resBase:', parseCpmmResult(resBase as CpmmComputePairResult, quoteToken.decimals));
    }

    let resQuote: AmmComputePairResult | CpmmComputePairResult;
    if (pool.poolType === 'amm') {
      resQuote = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: ammComputePoolInfo(pool),
        amount: quoteAmount,
        baseIn: false,
        slippage: slippage, // 1%
      });
      console.log('resQuote parsed:', parseAmmResult(resQuote as AmmComputePairResult));
    } else {
      resQuote = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: cpmmComputePoolInfo(pool),
        amount: quoteAmount,
        baseReserve: pool.rpcData.baseReserve,
        quoteReserve: pool.rpcData.quoteReserve,
        slippage: slippage,
        baseIn: false,
        epochInfo: epochInfo,
      });
      console.log('resQuote:', parseCpmmResult(resQuote as CpmmComputePairResult, baseToken.decimals));
    }

    // Parse the result differently for AMM and CPMM
    if (pool.poolType === 'amm') {
      // Handle AMM case separately
      const useBaseResult = resBase.liquidity.lte(resQuote.liquidity);
      const ammRes = useBaseResult ? (resBase as AmmComputePairResult) : (resQuote as AmmComputePairResult);
      const isBaseIn = useBaseResult;

      const resParsed = {
        anotherAmount:
          Number(ammRes.anotherAmount.numerator.toString()) / Number(ammRes.anotherAmount.denominator.toString()),
        maxAnotherAmount:
          Number(ammRes.maxAnotherAmount.numerator.toString()) / Number(ammRes.maxAnotherAmount.denominator.toString()),
        anotherAmountToken: ammRes.anotherAmount.token.symbol,
        maxAnotherAmountToken: ammRes.maxAnotherAmount.token.symbol,
        liquidity: ammRes.liquidity.toString(),
        poolType: pool.poolType,
        baseIn: isBaseIn,
      };

      console.log('resParsed:amm', resParsed);

      if (isBaseIn) {
        return {
          baseLimited: true,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: resParsed.anotherAmount,
          baseTokenAmountMax: baseTokenAmount,
          quoteTokenAmountMax: resParsed.maxAnotherAmount,
        };
      } else {
        return {
          baseLimited: false,
          baseTokenAmount: resParsed.anotherAmount,
          quoteTokenAmount: quoteTokenAmount,
          baseTokenAmountMax: resParsed.maxAnotherAmount,
          quoteTokenAmountMax: quoteTokenAmount,
        };
      }
    } else {
      // Handle CPMM case
      const useBaseResult = resBase.liquidity.lte(resQuote.liquidity);
      const cpmmRes = useBaseResult ? (resBase as CpmmComputePairResult) : (resQuote as CpmmComputePairResult);
      const isBaseIn = useBaseResult;

      const resParsed = {
        anotherAmount: Number(cpmmRes.anotherAmount.amount.toString()),
        maxAnotherAmount: Number(cpmmRes.maxAnotherAmount.amount.toString()),
        anotherAmountToken: isBaseIn ? baseToken.symbol : quoteToken.symbol,
        maxAnotherAmountToken: isBaseIn ? baseToken.symbol : quoteToken.symbol,
        liquidity: cpmmRes.liquidity.toString(),
      };
      console.log('resParsed:cpmm', resParsed);

      if (isBaseIn) {
        return {
          baseLimited: true,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: resParsed.anotherAmount / 10 ** quoteToken.decimals,
          baseTokenAmountMax: baseTokenAmount,
          quoteTokenAmountMax: resParsed.maxAnotherAmount / 10 ** quoteToken.decimals,
        };
      } else {
        return {
          baseLimited: false,
          baseTokenAmount: resParsed.anotherAmount / 10 ** baseToken.decimals,
          quoteTokenAmount: quoteTokenAmount,
          baseTokenAmountMax: resParsed.maxAnotherAmount / 10 ** baseToken.decimals,
          quoteTokenAmountMax: quoteTokenAmount,
        };
      }
    }
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

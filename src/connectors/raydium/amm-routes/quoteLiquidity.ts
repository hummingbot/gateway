import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Raydium } from '../raydium';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { 
  QuoteLiquidityRequest,
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType,
} from '../../../services/amm-interfaces';
import { isValidAmm, isValidCpmm } from '../raydium.utils';
import BN from 'bn.js';
import { ApiV3PoolInfoStandardItemCpmm, ApiV3PoolInfoStandardItem, Percent } from '@raydium-io/raydium-sdk-v2';

type AmmResult = {
  res: {
    liquidity: BN;
    anotherAmount: {
      numerator: BN;
      denominator: BN;
      token: { symbol: string };
    };
    maxAnotherAmount: {
      numerator: BN;
      denominator: BN;
      token: { symbol: string };
    };
  };
  baseIn: boolean;
};

type CpmmResult = {
  res: {
    liquidity: BN;
    anotherAmount: { amount: number };
    maxAnotherAmount: { amount: number };
  };
  baseIn: boolean;
};

export async function quoteLiquidity(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number
): Promise<QuoteLiquidityResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await Raydium.getInstance(network);

    const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolAddress);
    const programId = poolInfo.programId; 

    if (!isValidAmm(programId) && !isValidCpmm(programId)) {
      throw new Error('Target pool is not AMM or CPMM pool')
    }

    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

    const baseAmount = baseTokenAmount.toString();
    const quoteAmount = quoteTokenAmount.toString();

    if (!baseAmount && !quoteAmount) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const epochInfo = await solana.connection.getEpochInfo();
    // Convert percentage to basis points (multiply by 100 to handle decimals)
    // e.g., 0.5% becomes 50/10000, 0% becomes 0/10000
    const slippage = new Percent(
      Math.floor(((slippagePct === 0 ? 0 : slippagePct || raydium.getSlippagePct())) * 100), 
      10000
    );

    const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);

    let resBase;
    if (ammPoolInfo.poolType === 'amm') {
      resBase = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        amount: baseAmount,
        baseIn: true,
        slippage: slippage, // 1%
      })
    } else if (ammPoolInfo.poolType === 'cpmm') {
      const rawPool = await raydium.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress])
      resBase = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        amount: baseAmount,
        baseReserve: new BN(rawPool[poolAddress].baseReserve),
        quoteReserve: new BN(rawPool[poolAddress].quoteReserve),
        slippage: slippage,
        baseIn: true,
        epochInfo: epochInfo,
      })
    }

    let resQuote;
    if (ammPoolInfo.poolType === 'amm') {
      resQuote = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        amount: quoteAmount,
        baseIn: false,
        slippage: slippage, // 1%
      })
    } else if (ammPoolInfo.poolType === 'cpmm') {
      const rawPool = await raydium.raydiumSDK.cpmm.getRpcPoolInfos([poolAddress])
      resQuote = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        amount: quoteAmount,
        baseReserve: new BN(rawPool[poolAddress].baseReserve),
        quoteReserve: new BN(rawPool[poolAddress].quoteReserve),
        slippage: slippage,
        baseIn: false,
        epochInfo: epochInfo,
      })
    }

    let res: AmmResult | CpmmResult;
    // Parse the result differently for AMM and CPMM
    if (ammPoolInfo.poolType === 'amm') {
      res = resBase.liquidity.gte(resQuote.liquidity) 
        ? { res: resBase, baseIn: true } 
        : { res: resQuote, baseIn: false } as AmmResult;
      const ammRes = res as AmmResult;
      const resParsed = {
        anotherAmount: Number(ammRes.res.anotherAmount.numerator.toString()) / Number(ammRes.res.anotherAmount.denominator.toString()),
        maxAnotherAmount: Number(ammRes.res.maxAnotherAmount.numerator.toString()) / Number(ammRes.res.maxAnotherAmount.denominator.toString()),
        anotherAmountToken: ammRes.res.anotherAmount.token.symbol,
        maxAnotherAmountToken: ammRes.res.maxAnotherAmount.token.symbol,
        liquidity: ammPoolInfo.poolType === 'amm' ? ammRes.res.liquidity.toString() : ammRes.res.liquidity.toString(),
        poolType: ammPoolInfo.poolType,
        baseIn: ammRes.baseIn,
      };
      console.log('resParsed:amm', resParsed);
  
      if (ammRes.baseIn) {
        return {
          baseLimited: true,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: resParsed.anotherAmount,
          baseTokenAmountMax: baseTokenAmount,
          quoteTokenAmountMax: resParsed.maxAnotherAmount,
          poolInfo,
          poolKeys,
        };
      } else {
        return {
          baseLimited: false,
          baseTokenAmount: resParsed.anotherAmount,
          quoteTokenAmount: quoteTokenAmount,
          baseTokenAmountMax: resParsed.maxAnotherAmount,
          quoteTokenAmountMax: quoteTokenAmount,
          poolInfo,
          poolKeys,
        };
      }

    } else if (ammPoolInfo.poolType === 'cpmm') {
      console.log('resBase', {
        inputAmountFee: resBase.inputAmountFee.amount.toString(),
        anotherAmount: resBase.anotherAmount.amount.toString(),
        maxAnotherAmount: resBase.maxAnotherAmount.amount.toString(),
        liquidity: resBase.liquidity.toString()
      });
      console.log('resQuote', {
        inputAmountFee: resQuote.inputAmountFee.amount.toString(),
        anotherAmount: resQuote.anotherAmount.amount.toString(),
        maxAnotherAmount: resQuote.maxAnotherAmount.amount.toString(),
        liquidity: resQuote.liquidity.toString()
      });
      res = resBase.liquidity.lte(resQuote.liquidity)
        ? { res: resBase, baseIn: true }
        : { res: resQuote, baseIn: false } as CpmmResult;
      const cpmmRes = res as CpmmResult;
      const resParsed = { 
        anotherAmount: Number(cpmmRes.res.anotherAmount.amount),
        maxAnotherAmount: Number(cpmmRes.res.maxAnotherAmount.amount),
        anotherAmountToken: cpmmRes.baseIn ? baseToken.symbol : quoteToken.symbol,
        maxAnotherAmountToken: cpmmRes.baseIn ? baseToken.symbol : quoteToken.symbol,
        liquidity: cpmmRes.res.liquidity.toString(),
      }
      console.log('resParsed:cpmm', resParsed);

      if (cpmmRes.baseIn) {
        return {
          baseLimited: true,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: resParsed.anotherAmount / 10 ** quoteToken.decimals,
          baseTokenAmountMax: baseTokenAmount,
          quoteTokenAmountMax: resParsed.maxAnotherAmount / 10 ** quoteToken.decimals,
          poolInfo,
          poolKeys,
        };
      } else {
        return {
          baseLimited: false,
          baseTokenAmount: resParsed.anotherAmount / 10 ** baseToken.decimals,
          quoteTokenAmount: quoteTokenAmount,
          baseTokenAmountMax: resParsed.maxAnotherAmount / 10 ** baseToken.decimals,
          quoteTokenAmountMax: quoteTokenAmount,
          poolInfo,
          poolKeys,
        };
      }
    }

  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType | { error: string };
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Quote amounts for a new Raydium AMM liquidity position',
        tags: ['raydium-amm'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: { type: 'string', examples: ['6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'] },
            baseTokenAmount: { type: 'number', examples: [1] },
            quoteTokenAmount: { type: 'number', examples: [5] },
            slippagePct: { type: 'number', examples: [1] },
          }
        },
        response: {
          200: QuoteLiquidityResponse,
          500: { 
            type: 'object',
            properties: { error: { type: 'string' } }
          }
        },
      },
    },
    async (request) => {
      try {
        const { 
          network = 'mainnet-beta',
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.query;

        return await quoteLiquidity(
          fastify,
          network,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    }
  );
};

export default quoteLiquidityRoute;
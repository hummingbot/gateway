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

    // const baseToken = await solana.getToken(poolInfo.mintA.address);
    // const quoteToken = await solana.getToken(poolInfo.mintB.address);

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

    let resBase;
    if (isValidAmm(programId)) {
      resBase = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        amount: baseAmount,
        baseIn: true,
        slippage: slippage, // 1%
      })
    } else if (isValidCpmm(programId)) {
      resBase = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        amount: baseAmount,
        baseReserve: new BN(0),
        quoteReserve: new BN(0),
        slippage: slippage,
        baseIn: true,
        epochInfo: epochInfo,
      })
    }

    let resQuote;
    if (isValidAmm(programId)) {
      resQuote = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        amount: quoteAmount,
        baseIn: false,
        slippage: slippage, // 1%
      })
    } else if (isValidCpmm(programId)) {
      resQuote = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        amount: quoteAmount,
        baseReserve: new BN(0),
        quoteReserve: new BN(0),
        slippage: slippage,
        baseIn: false,
        epochInfo: epochInfo,
      })
    }
    console.log('resBase', {
      liquidity: resBase.liquidity.toString(),
      anotherAmountNumerator: resBase.anotherAmount.numerator.toString(),
      anotherAmountDenominator: resBase.anotherAmount.denominator.toString(),
      anotherAmountToken: resBase.anotherAmount.token.symbol,
      maxAnotherAmountNumerator: resBase.maxAnotherAmount.numerator.toString(),
      maxAnotherAmountDenominator: resBase.maxAnotherAmount.denominator.toString(),
      maxAnotherAmountToken: resBase.maxAnotherAmount.token.symbol,
      });
    console.log('resQuote', {
      liquidity: resQuote.liquidity.toString(),
      anotherAmountNumerator: resQuote.anotherAmount.numerator.toString(),
      anotherAmountDenominator: resQuote.anotherAmount.denominator.toString(),
      anotherAmountToken: resQuote.anotherAmount.token.symbol,
      maxAnotherAmountNumerator: resQuote.maxAnotherAmount.numerator.toString(),
      maxAnotherAmountDenominator: resQuote.maxAnotherAmount.denominator.toString(),
      maxAnotherAmountToken: resQuote.maxAnotherAmount.token.symbol,
    });

    const res = resBase.liquidity.gte(resQuote.liquidity) ? resBase : resQuote;

    console.log('res', {
      liquidity: res.liquidity.toString(),
      anotherAmountNumerator: res.anotherAmount.numerator.toString(),
      anotherAmountDenominator: res.anotherAmount.denominator.toString(),
      anotherAmountToken: res.anotherAmount.token.symbol,
      maxAnotherAmountNumerator: res.maxAnotherAmount.numerator.toString(),
      maxAnotherAmountDenominator: res.maxAnotherAmount.denominator.toString(),
      maxAnotherAmountToken: res.maxAnotherAmount.token.symbol,
    });

    const resParsed = {
      anotherAmount: Number(res.anotherAmount.numerator.toString()) / Number(res.anotherAmount.denominator.toString()),
      maxAnotherAmount: Number(res.maxAnotherAmount.numerator.toString()) / Number(res.maxAnotherAmount.denominator.toString()),
      anotherAmountToken: res.anotherAmount.token.symbol,
      maxAnotherAmountToken: res.maxAnotherAmount.token.symbol,
      liquidity: res.liquidity.toString()
    };
    console.log('resParsed', resParsed);

    if (res === resBase) {
      return {
        inputBase: true,
        baseTokenAmount: baseTokenAmount,
        quoteTokenAmount: resParsed.anotherAmount,
        baseTokenAmountMax: baseTokenAmount,
        quoteTokenAmountMax: resParsed.maxAnotherAmount,
        poolInfo,
        poolKeys,
      };
    } else {
      return {
        inputBase: false,
        baseTokenAmount: resParsed.anotherAmount,
        quoteTokenAmount: quoteTokenAmount,
        baseTokenAmountMax: resParsed.maxAnotherAmount,
        quoteTokenAmountMax: quoteTokenAmount,
        poolInfo,
        poolKeys,
      };
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
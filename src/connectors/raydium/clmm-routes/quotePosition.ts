import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Raydium } from '../raydium';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { 
  QuotePositionRequestType,
  QuotePositionResponseType,
  QuotePositionRequest,
  QuotePositionResponse
} from '../../../services/clmm-interfaces';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { TickUtils, PoolUtils } from '@raydium-io/raydium-sdk-v2';

export async function quotePosition(
  _fastify: FastifyInstance,
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number
): Promise<QuotePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await Raydium.getInstance(network);

    const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
    const rpcData = await raydium.getClmmPoolfromRPC(poolAddress)
    poolInfo.price = rpcData.currentPrice

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

    const baseAmountBN = new BN(new Decimal(baseTokenAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0));
    const quoteAmountBN = new BN(new Decimal(quoteTokenAmount).mul(10 ** poolInfo.mintB.decimals).toFixed(0));
    if (!baseAmountBN && !quoteAmountBN) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const epochInfo = await solana.connection.getEpochInfo();
    const slippage = (slippagePct === 0 ? 0 : (slippagePct || raydium.getSlippagePct())) / 100;
    const resBase = await PoolUtils.getLiquidityAmountOutFromAmountIn({
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
    const baseLiquidity = Number(resBase.liquidity.toString())
    console.log('resBase', {
      liquidity: baseLiquidity,
      amountA: Number(resBase.amountA.amount.toString()) / (10 ** poolInfo.mintA.decimals),
      amountB: Number(resBase.amountB.amount.toString()) / (10 ** poolInfo.mintB.decimals),
      amountSlippageA: Number(resBase.amountSlippageA.amount.toString()) / (10 ** poolInfo.mintA.decimals),
      amountSlippageB: Number(resBase.amountSlippageB.amount.toString()) / (10 ** poolInfo.mintB.decimals),
      price: (Number(resBase.amountB.amount.toString()) / (10 ** poolInfo.mintB.decimals)) / (Number(resBase.amountA.amount.toString()) / (10 ** poolInfo.mintA.decimals)),
      priceWithSlippage: (Number(resBase.amountSlippageB.amount.toString()) / (10 ** poolInfo.mintB.decimals)) / (Number(resBase.amountSlippageA.amount.toString()) / (10 ** poolInfo.mintA.decimals)),
      expirationTime: resBase.expirationTime
    });

    const resQuote = await PoolUtils.getLiquidityAmountOutFromAmountIn({
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
    const quoteLiquidity = Number(resQuote.liquidity.toString())
    console.log('resQuote', {
      liquidity: quoteLiquidity,
      amountA: Number(resQuote.amountA.amount.toString()) / (10 ** poolInfo.mintA.decimals),
      amountB: Number(resQuote.amountB.amount.toString()) / (10 ** poolInfo.mintB.decimals),
      amountSlippageA: Number(resQuote.amountSlippageA.amount.toString()) / (10 ** poolInfo.mintA.decimals),
      amountSlippageB: Number(resQuote.amountSlippageB.amount.toString()) / (10 ** poolInfo.mintB.decimals),
      price: (Number(resQuote.amountB.amount.toString()) / (10 ** poolInfo.mintB.decimals)) / (Number(resQuote.amountA.amount.toString()) / (10 ** poolInfo.mintA.decimals)),
      priceWithSlippage: (Number(resQuote.amountSlippageB.amount.toString()) / (10 ** poolInfo.mintB.decimals)) / (Number(resQuote.amountSlippageA.amount.toString()) / (10 ** poolInfo.mintA.decimals)),
      expirationTime: resQuote.expirationTime
    });

    const res = baseLiquidity < quoteLiquidity ? resBase : resQuote;
    return {
      baseLimited: baseLiquidity < quoteLiquidity,
      baseTokenAmount: Number(res.amountA.amount.toString()) / (10 ** poolInfo.mintA.decimals),
      quoteTokenAmount: Number(res.amountB.amount.toString()) / (10 ** poolInfo.mintB.decimals),
      baseTokenAmountMax: Number(res.amountSlippageA.amount.toString()) / (10 ** poolInfo.mintA.decimals),
      quoteTokenAmountMax: Number(res.amountSlippageB.amount.toString()) / (10 ** poolInfo.mintB.decimals),
      liquidity: res.liquidity,
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuotePositionRequestType;
    Reply: QuotePositionResponseType | { error: string };
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Quote amounts for a new Raydium CLMM position',
        tags: ['raydium-clmm'],
        querystring: {
          ...QuotePositionRequest,
          properties: {
            ...QuotePositionRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            lowerPrice: { type: 'number', examples: [100] },
            upperPrice: { type: 'number', examples: [180] },
            poolAddress: { type: 'string', examples: ['3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'] },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [15] },
            slippagePct: { type: 'number', examples: [1] },
          }
        },
        response: {
          200: QuotePositionResponse,
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
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.query;

        return await quotePosition(
          fastify,
          network,
          lowerPrice,
          upperPrice,
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

export default quotePositionRoute;
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
    // const rpcData = await raydium.getClmmPoolfromRPC(poolAddress)
    // poolInfo.price = rpcData.currentPrice
    // console.log('current price', poolInfo.price);

    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

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
    // console.log('lowerTick', lowerTick);
    // console.log('upperTick', upperTick);
    // console.log('tickLowerPrice', tickLowerPrice);
    // console.log('tickUpperPrice', tickUpperPrice);

    const baseAmountBN = new BN(new Decimal(baseTokenAmount).mul(10 ** baseToken.decimals).toFixed(0));
    const quoteAmountBN = new BN(new Decimal(quoteTokenAmount).mul(10 ** quoteToken.decimals).toFixed(0));

    if (!baseAmountBN && !quoteAmountBN) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const epochInfo = await solana.connection.getEpochInfo();
    const slippage = slippagePct || raydium.getSlippagePct() / 100;
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
    console.log('resBase', {
      liquidity: resBase.liquidity.toString(),
      amountA: Number(resBase.amountA.amount.toString()) / (10 ** baseToken.decimals),
      amountB: Number(resBase.amountB.amount.toString()) / (10 ** quoteToken.decimals),
      amountSlippageA: Number(resBase.amountSlippageA.amount.toString()) / (10 ** baseToken.decimals),
      amountSlippageB: Number(resBase.amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals),
      price: (Number(resBase.amountB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(resBase.amountA.amount.toString()) / (10 ** baseToken.decimals)),
      priceWithSlippage: (Number(resBase.amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(resBase.amountSlippageA.amount.toString()) / (10 ** baseToken.decimals)),
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
    console.log('resQuote', {
      liquidity: resQuote.liquidity.toString(),
      amountA: Number(resQuote.amountA.amount.toString()) / (10 ** baseToken.decimals),
      amountB: Number(resQuote.amountB.amount.toString()) / (10 ** quoteToken.decimals),
      amountSlippageA: Number(resQuote.amountSlippageA.amount.toString()) / (10 ** baseToken.decimals),
      amountSlippageB: Number(resQuote.amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals),
      price: (Number(resQuote.amountB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(resQuote.amountA.amount.toString()) / (10 ** baseToken.decimals)),
      priceWithSlippage: (Number(resQuote.amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(resQuote.amountSlippageA.amount.toString()) / (10 ** baseToken.decimals)),
      expirationTime: resQuote.expirationTime
    });

    const res = resBase.liquidity.lte(resQuote.liquidity) ? resBase : resQuote;

    console.log('Quote returned', {
      liquidity: res.liquidity.toString(),
      amountA: Number(res.amountA.amount.toString()) / (10 ** baseToken.decimals),
      amountB: Number(res.amountB.amount.toString()) / (10 ** quoteToken.decimals),
      amountSlippageA: Number(res.amountSlippageA.amount.toString()) / (10 ** baseToken.decimals),
      amountSlippageB: Number(res.amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals),
      price: (Number(res.amountB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(res.amountA.amount.toString()) / (10 ** baseToken.decimals)),
      priceWithSlippage: (Number(res.amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(res.amountSlippageA.amount.toString()) / (10 ** baseToken.decimals)),
      expirationTime: res.expirationTime
    });

    return {
      inputBase: res === resBase,
      baseTokenAmount: Number(res.amountA.amount.toString()) / (10 ** baseToken.decimals),
      quoteTokenAmount: Number(res.amountB.amount.toString()) / (10 ** quoteToken.decimals),
      baseTokenAmountMax: Number(res.amountSlippageA.amount.toString()) / (10 ** baseToken.decimals),
      quoteTokenAmountMax: Number(res.amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals),
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
            lowerPrice: { type: 'number', examples: [0.3] },
            upperPrice: { type: 'number', examples: [1] },
            poolAddress: { type: 'string', examples: ['BqBMwCcPXu6ZMKQBX2hYGGN4PNkEb15vLjigt8DKtuLp'] },
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
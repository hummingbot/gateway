import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { RaydiumCLMM } from '../raydium-clmm';
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

async function quotePosition(
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
    const raydium = await RaydiumCLMM.getInstance(network);

    const [poolInfo] = await raydium.getClmmPoolfromAPI(poolAddress);
    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

    const { tick: lowerTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(lowerPrice),
      baseIn: true,
    });    
    const { tick: upperTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(upperPrice),
      baseIn: true,
    });

    const amountBN = baseTokenAmount ?
      new BN(new Decimal(baseTokenAmount).mul(10 ** baseToken.decimals).toFixed(0)) :
      quoteTokenAmount ?
      new BN(new Decimal(quoteTokenAmount).mul(10 ** quoteToken.decimals).toFixed(0)) :
      undefined;

    if (!amountBN) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const epochInfo = await solana.connection.getEpochInfo();
    const res = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: (slippagePct || raydium.getSlippagePct()) / 100,
      inputA: Boolean(baseTokenAmount),
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      amount: amountBN,
      add: true,
      amountHasFee: true,
      epochInfo,
    });

    const { 
      liquidity,
      amountA,
      amountB,
      amountSlippageA,
      amountSlippageB,
      expirationTime 
    } = res;
    console.log({
      liquidity: liquidity.toString(),
      amountA: Number(amountA.amount.toString()) / (10 ** baseToken.decimals),
      amountB: Number(amountB.amount.toString()) / (10 ** quoteToken.decimals),
      amountSlippageA: Number(amountSlippageA.amount.toString()) / (10 ** baseToken.decimals),
      amountSlippageB: Number(amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals),
      price: (Number(amountB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(amountA.amount.toString()) / (10 ** baseToken.decimals)),
      priceWithSlippage: (Number(amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals)) / (Number(amountSlippageA.amount.toString()) / (10 ** baseToken.decimals)),
      expirationTime
    });

    return {
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
            network: { type: 'string', default: 'mainnet-beta' }
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
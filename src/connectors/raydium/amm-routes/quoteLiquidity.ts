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
import { Decimal } from 'decimal.js';
import { TickUtils, PoolUtils } from '@raydium-io/raydium-sdk-v2';
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
    const programId = poolKeys.programId; 

    if (!isValidAmm(programId) && !isValidCpmm(programId)) {
      throw new Error('Target pool is not AMM or CPMM pool')
    }

    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

    const baseAmountBN = new BN(new Decimal(baseTokenAmount).mul(10 ** baseToken.decimals).toFixed(0));
    const quoteAmountBN = new BN(new Decimal(quoteTokenAmount).mul(10 ** quoteToken.decimals).toFixed(0));

    if (!baseAmountBN && !quoteAmountBN) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    const epochInfo = await solana.connection.getEpochInfo();
    const slippage = new Percent(slippagePct || raydium.getSlippagePct() / 100);

    let res;
    const baseIn = true;
    if (isValidAmm(programId)) {
      res = raydium.raydiumSDK.liquidity.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
        amount: baseAmountBN,
        baseIn: true,
        slippage: slippage, // 1%
      })
    } else if (isValidCpmm(programId)) {
      res = raydium.raydiumSDK.cpmm.computePairAmount({
        poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
        amount: baseAmountBN,
        baseReserve: new BN(0),
        quoteReserve: new BN(0),
        slippage: slippage,
        baseIn: true,
        epochInfo: epochInfo,
      })
    }


    console.log('res', res);
    return res;
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
            quoteTokenAmount: { type: 'number', examples: [0] },
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
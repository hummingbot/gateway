import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  QuoteLiquidityRequestType,
  QuoteLiquidityResponse,
  QuoteLiquidityResponseType,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pumpswap } from '../pumpswap';
import { PumpswapConfig } from '../pumpswap.config';
import { PumpswapAmmQuoteLiquidityRequest } from '../schemas';

export async function quoteLiquidity(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = PumpswapConfig.config.slippagePct,
): Promise<QuoteLiquidityResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const pumpswap = await Pumpswap.getInstance(network);

    // Get pool info
    const poolInfo = await pumpswap.getAmmPoolInfo(poolAddress);
    if (!poolInfo) {
      throw new Error('Pool not found');
    }

    if (!baseTokenAmount && !quoteTokenAmount) {
      throw new Error('Must provide baseTokenAmount or quoteTokenAmount');
    }

    // Calculate the other amount based on pool ratio
    // For AMM: maintain the ratio baseAmount/quoteAmount = poolBase/poolQuote
    let calculatedBaseAmount: number;
    let calculatedQuoteAmount: number;
    let baseLimited: boolean;

    if (baseTokenAmount) {
      // Calculate quote amount based on pool ratio
      calculatedBaseAmount = baseTokenAmount;
      calculatedQuoteAmount = (baseTokenAmount * poolInfo.quoteTokenAmount) / poolInfo.baseTokenAmount;
      baseLimited = true;
    } else {
      // Calculate base amount based on pool ratio
      calculatedQuoteAmount = quoteTokenAmount;
      calculatedBaseAmount = (quoteTokenAmount * poolInfo.baseTokenAmount) / poolInfo.quoteTokenAmount;
      baseLimited = false;
    }

    // Apply slippage
    const slippageMultiplier = 1 + slippagePct / 100;
    const baseTokenAmountMax = baseLimited ? calculatedBaseAmount : calculatedBaseAmount * slippageMultiplier;
    const quoteTokenAmountMax = baseLimited ? calculatedQuoteAmount * slippageMultiplier : calculatedQuoteAmount;

    return {
      baseLimited,
      baseTokenAmount: calculatedBaseAmount,
      quoteTokenAmount: calculatedQuoteAmount,
      baseTokenAmountMax,
      quoteTokenAmountMax,
    };
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
        description: 'Quote amounts for a new Pumpswap AMM liquidity position',
        tags: ['/connector/pumpswap'],
        querystring: PumpswapAmmQuoteLiquidityRequest,
        response: {
          200: QuoteLiquidityResponse,
          500: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.query;

        return await quoteLiquidity(fastify, network, poolAddress, baseTokenAmount, quoteTokenAmount, slippagePct);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quoteLiquidityRoute;

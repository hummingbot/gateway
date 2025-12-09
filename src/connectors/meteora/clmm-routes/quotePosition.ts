import { StrategyType, getPriceOfBinByBinId } from '@meteora-ag/dlmm';
import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponseType, QuotePositionResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmQuotePositionRequest } from '../schemas';

export async function quotePosition(
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
  strategyType?: StrategyType,
): Promise<QuotePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const meteora = await Meteora.getInstance(network);

    // Get DLMM pool instance
    const dlmmPool = await meteora.getDlmmPool(poolAddress);

    // Get current bin information
    const activeBinId = dlmmPool.lbPair.activeId;
    const binStep = dlmmPool.lbPair.binStep;

    // Calculate bin IDs from price range
    const lowerBinId = dlmmPool.getBinIdFromPrice(lowerPrice, false);
    const upperBinId = dlmmPool.getBinIdFromPrice(upperPrice, true);

    // Use provided strategy type or default to Spot
    const strategy = {
      minBinId: Math.min(lowerBinId, upperBinId),
      maxBinId: Math.max(lowerBinId, upperBinId),
      strategyType: strategyType ?? StrategyType.Spot,
    };

    // Get token amounts needed for the position
    const slippage = slippagePct / 100;

    // Calculate liquidity distribution if amounts are provided
    let baseAmount = 0;
    let quoteAmount = 0;
    let baseAmountMax = 0;
    let quoteAmountMax = 0;
    let baseLimited = false;
    let liquidityValue = '0';

    if (baseTokenAmount || quoteTokenAmount) {
      // Get current price adjusted for decimals
      const rawPrice = getPriceOfBinByBinId(activeBinId, binStep).toNumber();
      const decimalDiff = dlmmPool.tokenX.mint.decimals - dlmmPool.tokenY.mint.decimals;
      const adjustmentFactor = Math.pow(10, decimalDiff);
      const currentPrice = rawPrice * adjustmentFactor;

      // Calculate amounts based on strategy
      if (baseTokenAmount && !quoteTokenAmount) {
        baseLimited = true;
        baseAmount = baseTokenAmount;
        baseAmountMax = baseTokenAmount * (1 + slippage);
        // Estimate quote amount based on price range and strategy
        const avgPrice = (lowerPrice + upperPrice) / 2;
        quoteAmount = baseAmount * avgPrice;
        quoteAmountMax = quoteAmount * (1 + slippage);
      } else if (quoteTokenAmount && !baseTokenAmount) {
        baseLimited = false;
        quoteAmount = quoteTokenAmount;
        quoteAmountMax = quoteTokenAmount * (1 + slippage);
        // Estimate base amount based on price range and strategy
        const avgPrice = (lowerPrice + upperPrice) / 2;
        baseAmount = quoteAmount / avgPrice;
        baseAmountMax = baseAmount * (1 + slippage);
      } else if (baseTokenAmount && quoteTokenAmount) {
        // Both amounts provided - use ratio to determine limiting token
        const providedRatio = quoteTokenAmount / baseTokenAmount;
        baseLimited = providedRatio > currentPrice;

        if (baseLimited) {
          baseAmount = baseTokenAmount;
          baseAmountMax = baseTokenAmount * (1 + slippage);
          quoteAmount = baseTokenAmount * currentPrice;
          quoteAmountMax = quoteAmount * (1 + slippage);
        } else {
          quoteAmount = quoteTokenAmount;
          quoteAmountMax = quoteTokenAmount * (1 + slippage);
          baseAmount = quoteTokenAmount / currentPrice;
          baseAmountMax = baseAmount * (1 + slippage);
        }
      }

      // Calculate liquidity estimate
      // For DLMM pools, liquidity is distributed across bins based on the strategy
      // We'll estimate it based on the token amounts in lamports
      try {
        const tokenXAmountLamports = baseAmount * Math.pow(10, dlmmPool.tokenX.mint.decimals);
        const tokenYAmountLamports = quoteAmount * Math.pow(10, dlmmPool.tokenY.mint.decimals);

        // For a balanced position, liquidity can be approximated as the geometric mean
        // This is a simplified estimate; actual distribution depends on bin strategy
        const estimatedLiquidity = Math.floor(Math.sqrt(tokenXAmountLamports * tokenYAmountLamports));
        liquidityValue = estimatedLiquidity.toString();
      } catch (error) {
        logger.warn('Failed to calculate liquidity estimate:', error);
      }
    }

    return {
      baseLimited,
      baseTokenAmount: baseAmount,
      quoteTokenAmount: quoteAmount,
      baseTokenAmountMax: baseAmountMax,
      quoteTokenAmountMax: quoteAmountMax,
      liquidity: liquidityValue,
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof MeteoraClmmQuotePositionRequest>;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Quote amounts for a new Meteora CLMM position',
        tags: ['/connector/meteora'],
        querystring: MeteoraClmmQuotePositionRequest,
        response: {
          200: QuotePositionResponse,
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
          slippagePct,
          strategyType,
        } = request.query;

        return await quotePosition(
          network,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e; // Re-throw HttpErrors with original message
        }
        throw httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quotePositionRoute;

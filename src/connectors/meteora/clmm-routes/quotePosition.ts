import { StrategyType, getPriceOfBinByBinId } from '@meteora-ag/dlmm';
import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { QuotePositionResponseType, QuotePositionResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmQuotePositionRequest } from '../schemas';

export async function quotePosition(
  _fastify: FastifyInstance,
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

    // Use provided strategy type or default to SpotBalanced
    const strategy = {
      minBinId: Math.min(lowerBinId, upperBinId),
      maxBinId: Math.max(lowerBinId, upperBinId),
      strategyType: strategyType ?? StrategyType.SpotBalanced,
    };

    // Quote the position creation to get cost estimates
    const quoteResult = await dlmmPool.quoteCreatePosition({ strategy });

    // Get token amounts needed for the position
    const slippage = slippagePct / 100;

    // Calculate liquidity distribution if amounts are provided
    let baseAmount = 0;
    let quoteAmount = 0;
    let baseAmountMax = 0;
    let quoteAmountMax = 0;
    let baseLimited = false;

    if (baseTokenAmount || quoteTokenAmount) {
      // Get pool token info
      const tokenX = await solana.getToken(dlmmPool.lbPair.tokenXMint.toString());
      const tokenY = await solana.getToken(dlmmPool.lbPair.tokenYMint.toString());

      // Determine which token is base and which is quote
      const baseIsTokenX =
        tokenX.symbol === dlmmPool.lbPair.tokenXMint.toString() ||
        tokenX.address === dlmmPool.lbPair.tokenXMint.toString();

      // Calculate amounts based on strategy
      if (baseTokenAmount && !quoteTokenAmount) {
        baseLimited = true;
        baseAmount = baseTokenAmount;
        baseAmountMax = baseTokenAmount * (1 + slippage);
        // Estimate quote amount based on price range and strategy
        const currentPrice = getPriceOfBinByBinId(activeBinId, binStep).toNumber();
        const avgPrice = (lowerPrice + upperPrice) / 2;
        quoteAmount = baseAmount * avgPrice;
        quoteAmountMax = quoteAmount * (1 + slippage);
      } else if (quoteTokenAmount && !baseTokenAmount) {
        baseLimited = false;
        quoteAmount = quoteTokenAmount;
        quoteAmountMax = quoteTokenAmount * (1 + slippage);
        // Estimate base amount based on price range and strategy
        const currentPrice = getPriceOfBinByBinId(activeBinId, binStep).toNumber();
        const avgPrice = (lowerPrice + upperPrice) / 2;
        baseAmount = quoteAmount / avgPrice;
        baseAmountMax = baseAmount * (1 + slippage);
      } else if (baseTokenAmount && quoteTokenAmount) {
        // Both amounts provided - use ratio to determine limiting token
        const currentPrice = getPriceOfBinByBinId(activeBinId, binStep).toNumber();
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
    }

    return {
      baseLimited,
      baseTokenAmount: baseAmount,
      quoteTokenAmount: quoteAmount,
      baseTokenAmountMax: baseAmountMax,
      quoteTokenAmountMax: quoteAmountMax,
      liquidity: Math.floor(quoteResult.positionCost || 0).toString(), // Using positionCost as a proxy for liquidity
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
          fastify,
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
        throw fastify.httpErrors.internalServerError('Failed to quote position');
      }
    },
  );
};

export default quotePositionRoute;

import { FastifyPluginAsync } from 'fastify';

import {
  MetaDaoQuoteLiquidityRequest,
  MetaDaoQuoteLiquidityRequestType,
  MetaDaoQuoteLiquidityResponse,
  MetaDaoQuoteLiquidityResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { findDaoByBaseToken } from '../dao-lookup';
import { MetaDao } from '../metadao';

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoQuoteLiquidityRequestType;
    Reply: MetaDaoQuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get a quote for adding liquidity to MetaDAO spot pool',
        tags: ['/connector/metadao'],
        querystring: MetaDaoQuoteLiquidityRequest,
        response: {
          200: MetaDaoQuoteLiquidityResponse,
        },
      },
    },
    async (request): Promise<MetaDaoQuoteLiquidityResponseType> => {
      const { baseToken, quoteAmount, slippagePct = 0.5 } = request.query;
      const network = request.query.network || 'mainnet-beta';

      try {
        // Look up DAO by baseToken
        const daoAddress = findDaoByBaseToken(baseToken);
        if (!daoAddress) {
          throw fastify.httpErrors.notFound(`No DAO found for baseToken: ${baseToken}`);
        }

        const metadao = await MetaDao.getInstance(network);

        // Fetch DAO account
        const daoAccount = await metadao.getDao(daoAddress);

        // Check pool state - liquidity operations only work in Spot state
        const poolStateType = metadao.getPoolStateType(daoAccount);
        if (poolStateType !== 'spot') {
          throw fastify.httpErrors.badRequest('Liquidity provision is unavailable while a proposal market is active');
        }

        // Get token decimals
        const baseDecimals = await metadao.getTokenDecimals(daoAccount.baseMint.toString());
        const quoteDecimals = await metadao.getTokenDecimals(daoAccount.quoteMint.toString());

        // Get spot pool
        const spotPool = metadao.getSpotPool(daoAccount);

        // Convert quote amount to raw
        const rawQuoteAmount = metadao.toRawAmount(quoteAmount, quoteDecimals);

        // Calculate liquidity
        const { baseAmount: rawBaseAmount, liquidityMinted: rawLiquidityMinted } = metadao.calculateLiquidityMint(
          rawQuoteAmount,
          spotPool.baseReserves,
          spotPool.quoteReserves,
          daoAccount.totalLiquidity,
        );

        // Convert to human-readable
        const baseAmount = metadao.fromRawAmount(rawBaseAmount, baseDecimals);
        const liquidityMinted = metadao.fromRawLiquidity(rawLiquidityMinted, quoteDecimals);
        const totalLiquidity = metadao.fromRawLiquidity(daoAccount.totalLiquidity, quoteDecimals);

        // Calculate with slippage
        const slippageMultiplier = 1 + slippagePct / 100;
        const maxBaseAmount = baseAmount * slippageMultiplier;

        const minSlippageMultiplier = 1 - slippagePct / 100;
        const minLiquidity = liquidityMinted * minSlippageMultiplier;

        // Calculate share of pool after deposit
        const newTotalLiquidity = totalLiquidity + liquidityMinted;
        const shareOfPool = newTotalLiquidity > 0 ? (liquidityMinted / newTotalLiquidity) * 100 : 100;

        const response: MetaDaoQuoteLiquidityResponseType = {
          pool: daoAddress,
          baseMint: daoAccount.baseMint.toString(),
          quoteMint: daoAccount.quoteMint.toString(),
          poolState: poolStateType,
          quoteAmount,
          baseAmount,
          maxBaseAmount,
          liquidityMinted,
          minLiquidity,
          totalLiquidity,
          totalLiquidityRaw: daoAccount.totalLiquidity.toString(),
          shareOfPool,
          poolReserves: {
            base: metadao.fromRawAmount(spotPool.baseReserves, baseDecimals),
            quote: metadao.fromRawAmount(spotPool.quoteReserves, quoteDecimals),
            baseRaw: spotPool.baseReserves.toString(),
            quoteRaw: spotPool.quoteReserves.toString(),
          },
        };

        return response;
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error getting liquidity quote for baseToken ${baseToken}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to get liquidity quote: ${error}`);
      }
    },
  );
};

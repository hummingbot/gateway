import { FastifyPluginAsync } from 'fastify';

import {
  MetaDaoPoolInfoRequest,
  MetaDaoPoolInfoRequestType,
  MetaDaoPoolInfoResponse,
  MetaDaoPoolInfoResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { findDaoByBaseToken } from '../dao-lookup';
import { MetaDao } from '../metadao';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoPoolInfoRequestType;
    Reply: MetaDaoPoolInfoResponseType;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get MetaDAO DAO AMM state, reserves, and proposal info',
        tags: ['/connector/metadao'],
        querystring: MetaDaoPoolInfoRequest,
        response: {
          200: MetaDaoPoolInfoResponse,
        },
      },
    },
    async (request): Promise<MetaDaoPoolInfoResponseType> => {
      const { baseToken } = request.query;
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

        // Get token decimals for display
        const baseDecimals = await metadao.getTokenDecimals(daoAccount.baseMint.toString());
        const quoteDecimals = await metadao.getTokenDecimals(daoAccount.quoteMint.toString());

        // Resolve token symbols
        const baseSymbol = await metadao.getTokenSymbol(daoAccount.baseMint.toString());
        const quoteSymbol = await metadao.getTokenSymbol(daoAccount.quoteMint.toString());

        // Get pool state
        const poolStateType = metadao.getPoolStateType(daoAccount);
        const spotPool = metadao.getSpotPool(daoAccount);

        // Build spot pool info
        const spotPoolInfo = {
          baseReserves: metadao.fromRawAmount(spotPool.baseReserves, baseDecimals),
          quoteReserves: metadao.fromRawAmount(spotPool.quoteReserves, quoteDecimals),
          baseReservesRaw: spotPool.baseReserves.toString(),
          quoteReservesRaw: spotPool.quoteReserves.toString(),
          price: spotPool.baseReserves.isZero()
            ? 0
            : metadao.fromRawAmount(spotPool.quoteReserves, quoteDecimals) /
              metadao.fromRawAmount(spotPool.baseReserves, baseDecimals),
          baseVault: daoAccount.ammBaseVault.toString(),
          quoteVault: daoAccount.ammQuoteVault.toString(),
        };

        const response: MetaDaoPoolInfoResponseType = {
          pool: daoAddress,
          baseMint: daoAccount.baseMint.toString(),
          quoteMint: daoAccount.quoteMint.toString(),
          baseSymbol,
          quoteSymbol,
          state: poolStateType,
          totalLiquidity: metadao.fromRawLiquidity(daoAccount.totalLiquidity, quoteDecimals),
          totalLiquidityRaw: daoAccount.totalLiquidity.toString(),
          spot: spotPoolInfo,
        };

        // Include pass/fail pools if in futarchy state
        if (poolStateType === 'futarchy') {
          const passPool = metadao.getPassPool(daoAccount);
          const failPool = metadao.getFailPool(daoAccount);

          if (passPool) {
            response.pass = {
              baseReserves: metadao.fromRawAmount(passPool.baseReserves, baseDecimals),
              quoteReserves: metadao.fromRawAmount(passPool.quoteReserves, quoteDecimals),
              baseReservesRaw: passPool.baseReserves.toString(),
              quoteReservesRaw: passPool.quoteReserves.toString(),
              price: passPool.baseReserves.isZero()
                ? 0
                : metadao.fromRawAmount(passPool.quoteReserves, quoteDecimals) /
                  metadao.fromRawAmount(passPool.baseReserves, baseDecimals),
            };
          }

          if (failPool) {
            response.fail = {
              baseReserves: metadao.fromRawAmount(failPool.baseReserves, baseDecimals),
              quoteReserves: metadao.fromRawAmount(failPool.quoteReserves, quoteDecimals),
              baseReservesRaw: failPool.baseReserves.toString(),
              quoteReservesRaw: failPool.quoteReserves.toString(),
              price: failPool.baseReserves.isZero()
                ? 0
                : metadao.fromRawAmount(failPool.quoteReserves, quoteDecimals) /
                  metadao.fromRawAmount(failPool.baseReserves, baseDecimals),
            };
          }
        }

        return response;
      } catch (error) {
        logger.error(`Error fetching pool info for baseToken ${baseToken}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to fetch pool info: ${error}`);
      }
    },
  );
};

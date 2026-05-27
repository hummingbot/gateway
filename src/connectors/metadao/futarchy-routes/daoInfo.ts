import { FastifyPluginAsync } from 'fastify';

import {
  MetaDaoDaoInfoRequest,
  MetaDaoDaoInfoRequestType,
  MetaDaoDaoInfoResponse,
  MetaDaoDaoInfoResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { MetaDao } from '../metadao';

// /dao-info - fetches info for a specific pool address from chain
export const daoInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoDaoInfoRequestType;
    Reply: MetaDaoDaoInfoResponseType;
  }>(
    '/dao-info',
    {
      schema: {
        description: 'Get MetaDAO pool info by pool address (fetches from chain)',
        tags: ['/connector/metadao'],
        querystring: MetaDaoDaoInfoRequest,
        response: {
          200: MetaDaoDaoInfoResponse,
        },
      },
    },
    async (request): Promise<MetaDaoDaoInfoResponseType> => {
      const { pool: daoAddress } = request.query;
      const network = request.query.network || 'mainnet-beta';

      try {
        const metadao = await MetaDao.getInstance(network);

        // Fetch DAO account directly by address
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

        const response: MetaDaoDaoInfoResponseType = {
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
        if ((error as any).statusCode) throw error;
        logger.error(`Error fetching dao info for pool ${daoAddress}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to fetch dao info: ${error}`);
      }
    },
  );
};

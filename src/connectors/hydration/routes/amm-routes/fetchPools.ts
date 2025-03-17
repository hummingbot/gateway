import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Hydration } from '../../hydration';
import { Polkadot } from '../../../../chains/polkadot/polkadot';
import { logger } from '../../../../services/logger';
import {
  PoolInfoSchema,
  FetchPoolsRequest,
} from '../../../../services/clmm-interfaces';
import { httpNotFound, httpInternalServerError, ERROR_MESSAGES } from '../../../../services/error-handler';

/**
 * Route handler for fetching pools
 */
export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/fetch-pools', {
    schema: {
      description: 'Fetch info about Hydration pools',
      tags: ['hydration'],
      querystring: {
        ...FetchPoolsRequest,
        properties: {
          network: { type: 'string', default: 'mainnet' },
          limit: { type: 'number', minimum: 1, default: 10 },
          tokenA: { type: 'string', examples: ['DOT'] },
          tokenB: { type: 'string', examples: ['USDT'] }
        }
      },
      response: {
        200: Type.Array(PoolInfoSchema)
      }
    },
    handler: async (request, _reply) => {
      try {
        const { limit, tokenA, tokenB } = request.query as typeof FetchPoolsRequest;
        const network = (request.query as typeof FetchPoolsRequest).network || 'mainnet';

        const hydration = await Hydration.getInstance(network);
        const polkadot = await Polkadot.getInstance(network);

        let tokenMintA, tokenMintB;

        if (tokenA) {
          const tokenInfoA = await polkadot.getToken(tokenA);
          if (!tokenInfoA) {
            throw httpNotFound(ERROR_MESSAGES.TOKEN_NOT_FOUND(tokenA));
          }
          tokenMintA = tokenInfoA.address;
        }

        if (tokenB) {
          const tokenInfoB = await polkadot.getToken(tokenB);
          if (!tokenInfoB) {
            throw httpNotFound(ERROR_MESSAGES.TOKEN_NOT_FOUND(tokenB));
          }
          tokenMintB = tokenInfoB.address;
        }

        const pools = await hydration.getPools(limit, tokenMintA, tokenMintB);
        if (!Array.isArray(pools)) {
          logger.error('No matching Hydration pools found');
          return [];
        }

        return pools.map(pool => ({
          poolAddress: pool.poolAddress,
          baseToken: {
            symbol: pool.baseToken.symbol,
            address: pool.baseToken.address,
            decimals: pool.baseToken.decimals,
            name: pool.baseToken.name
          },
          quoteToken: {
            symbol: pool.quoteToken.symbol,
            address: pool.quoteToken.address,
            decimals: pool.quoteToken.decimals,
            name: pool.quoteToken.name
          },
          fee: pool.fee,
          liquidity: pool.liquidity,
          sqrtPrice: pool.sqrtPrice,
          tick: pool.tick,
          price: pool.price,
          volume24h: pool.volume24h,
          volumeWeek: pool.volumeWeek,
          tvl: pool.tvl,
          apr: pool.apr
        }));
      } catch (e) {
        logger.error('Error in fetch-pools:', e);
        if (e.statusCode) throw e;
        throw httpInternalServerError();
      }
    }
  });
};

export default fetchPoolsRoute;


import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';
import { ensureTokenSaved } from '../../services/token-pool-autosave';
import { TokenService } from '../../services/token-service';
import { fetchTokenInfo } from '../../tokens/token-lookup-helper';
import { Token } from '../../tokens/types';
import { handlePoolError } from '../pool-error-handler';
import { fetchPoolInfo } from '../pool-info-helpers';
import { fetchDetailedPoolInfo } from '../pool-lookup-helper';
import { FindPoolsQuerySchema, PoolInfoSchema } from '../schemas';
import { Pool } from '../types';

/**
 * Record a token, reporting whether it was new.
 *
 * ensureTokenSaved is the single writer into the token list — it names the token from
 * the chain, checks for an existing entry by ADDRESS, and refuses to write one whose
 * on-chain symbol belongs to a different address. It cannot say whether it added or
 * found, which this route's `tokensAdded` needs, so existence is checked first. That
 * read hits the same list ensureTokenSaved is about to read, so it costs nothing new.
 *
 * GeckoTerminal stays as the fallback for a mint with no Token-2022 extension and no
 * Metaplex account, or an ERC-20 that never implemented name()/symbol().
 */
async function saveToken(
  chain: string,
  network: string,
  chainNetwork: string,
  address: string,
  tokensAdded: string[],
): Promise<Token | null> {
  const existed = await TokenService.getInstance().getToken(chain, network, address);

  const token = await ensureTokenSaved(chain, network, address, async (addr) => {
    const info = await fetchTokenInfo(chainNetwork, addr);
    return info ? { name: info.name, symbol: info.symbol, address: info.address, decimals: info.decimals } : null;
  });

  if (token && !existed) {
    tokensAdded.push(token.symbol);
  }
  return token;
}

export const savePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { address: string };
    Querystring: { chainNetwork: string; connector?: string; type?: 'amm' | 'clmm' };
    Reply: { message: string; pool: Pool; tokensAdded?: string[] };
  }>(
    '/save/:address',
    {
      schema: {
        description:
          'Save a pool to the pool list, auto-adding its tokens. Pass connector and type to ' +
          'name the pool directly from that connector; omit them and GeckoTerminal is asked ' +
          'which DEX the address belongs to first.',
        tags: ['/pools'],
        params: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Pool contract address',
              examples: ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'],
            },
          },
          required: ['address'],
        },
        querystring: Type.Object({
          chainNetwork: FindPoolsQuerySchema.properties.chainNetwork,
          connector: Type.Optional(
            Type.String({
              description:
                'DEX connector the pool belongs to. Supply it with `type` to skip the ' +
                'GeckoTerminal lookup — a caller that already knows the venue, such as one ' +
                'holding an LP provider config, always does.',
              examples: ['meteora', 'raydium', 'orca', 'uniswap'],
            }),
          ),
          type: Type.Optional(
            Type.Union([Type.Literal('amm'), Type.Literal('clmm')], {
              description: 'Pool type. Required alongside `connector`.',
            }),
          ),
        }),
        response: {
          200: Type.Object({
            message: Type.String(),
            pool: PoolInfoSchema,
            tokensAdded: Type.Optional(Type.Array(Type.String())),
          }),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const { chainNetwork, connector, type } = request.query;

      try {
        const { chain, network } = CoinGeckoService.getInstance().parseChainNetwork(chainNetwork);

        if ((connector && !type) || (type && !connector)) {
          throw new Error('connector and type must be given together, or both omitted');
        }

        // GeckoTerminal is only needed to answer "which DEX is this address, and is it
        // amm or clmm" — the pool's own facts come from the connector either way. A
        // caller that already knows the venue can skip that question entirely, which is
        // the common case: anything holding an LP provider config knows it.
        let facts: { baseTokenAddress: string; quoteTokenAddress: string; feePct: number };
        let poolConnector: string;
        let poolType: 'amm' | 'clmm';

        if (connector && type) {
          const info = await fetchPoolInfo(connector, type, network, address);
          if (!info) {
            throw new Error(`Unable to fetch pool-info for ${address} from ${connector} ${type} on ${network}`);
          }
          facts = info;
          poolConnector = connector;
          poolType = type;
          logger.info(`Naming pool ${address} from ${connector} ${type}, no GeckoTerminal lookup`);
        } else {
          const { poolData, pool: found } = await fetchDetailedPoolInfo(chainNetwork, address);
          facts = {
            baseTokenAddress: found.baseTokenAddress,
            quoteTokenAddress: found.quoteTokenAddress,
            feePct: found.feePct,
          };
          poolConnector = found.connector;
          poolType = poolData.type as 'amm' | 'clmm';
        }

        const tokensAdded: string[] = [];
        const [base, quote] = [
          await saveToken(chain, network, chainNetwork, facts.baseTokenAddress, tokensAdded),
          await saveToken(chain, network, chainNetwork, facts.quoteTokenAddress, tokensAdded),
        ];

        // A pool is filed under its pair, so an unnamed side leaves nothing to file it
        // under — the same rule ensurePoolSaved applies on the trading paths.
        if (!base || !quote) {
          throw new Error(
            `Cannot name pool ${address}: ${!base ? facts.baseTokenAddress : facts.quoteTokenAddress} has no symbol`,
          );
        }

        const pool: Pool = {
          connector: poolConnector,
          type: poolType,
          network,
          address,
          baseSymbol: base.symbol,
          quoteSymbol: quote.symbol,
          baseTokenAddress: base.address,
          quoteTokenAddress: quote.address,
          feePct: facts.feePct,
        };

        const poolService = PoolService.getInstance();
        const tokenMsg = tokensAdded.length > 0 ? ` (auto-added tokens: ${tokensAdded.join(', ')})` : '';

        if (await poolService.getPoolByAddress(chain, network, address)) {
          logger.info(`Pool ${pool.baseSymbol}-${pool.quoteSymbol} (${address}) already exists, updating`);
          await poolService.updatePoolByAddress(chain, network, pool);
          return {
            message: `Pool ${pool.baseSymbol}-${pool.quoteSymbol} already exists in the pool list for ${chain}/${network}, updated with latest data${tokenMsg}`,
            pool,
            tokensAdded: tokensAdded.length > 0 ? tokensAdded : undefined,
          };
        }

        await poolService.addPool(chain, network, pool);
        logger.info(
          `Saved pool ${pool.baseSymbol}-${pool.quoteSymbol} (${address}) to ${chain}/${network} ${poolType}`,
        );

        return {
          message: `Pool ${pool.baseSymbol}-${pool.quoteSymbol} has been added to the pool list for ${chain}/${network}${tokenMsg}`,
          pool,
          tokensAdded: tokensAdded.length > 0 ? tokensAdded : undefined,
        };
      } catch (error: any) {
        handlePoolError(fastify, error, 'Failed to find and save pool');
      }
    },
  );
};

export default savePoolRoute;

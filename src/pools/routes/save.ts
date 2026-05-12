import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { CoinGeckoService } from '../../services/coingecko-service';
import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';
import { TokenService } from '../../services/token-service';
import { Token } from '../../tokens/types';
import { handlePoolError } from '../pool-error-handler';
import { fetchDetailedPoolInfo } from '../pool-lookup-helper';
import { FindPoolsQuerySchema, PoolInfoSchema } from '../schemas';
import { Pool } from '../types';

/**
 * Auto-save a token if it doesn't exist in the token list
 * Fetches token info from GeckoTerminal and adds it
 */
async function autoSaveTokenIfMissing(
  chain: string,
  network: string,
  chainNetwork: string,
  tokenAddress: string,
  tokenSymbol: string,
): Promise<{ added: boolean; symbol: string }> {
  const tokenService = TokenService.getInstance();
  const coinGeckoService = CoinGeckoService.getInstance();

  // Check if token already exists by address
  const existingToken = await tokenService.getToken(chain, network, tokenAddress);
  if (existingToken) {
    return { added: false, symbol: existingToken.symbol };
  }

  // Token doesn't exist, fetch info from GeckoTerminal
  try {
    logger.info(`Token ${tokenSymbol} (${tokenAddress}) not found, fetching from GeckoTerminal...`);
    const tokenInfo = await coinGeckoService.getTokenInfo(chainNetwork, tokenAddress);

    const newToken: Token = {
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      address: tokenInfo.address,
      decimals: tokenInfo.decimals,
    };

    await tokenService.addToken(chain, network, newToken);
    logger.info(`Auto-added token ${newToken.symbol} (${newToken.address}) to ${chain}/${network}`);

    return { added: true, symbol: newToken.symbol };
  } catch (error: any) {
    logger.warn(`Failed to auto-add token ${tokenSymbol} (${tokenAddress}): ${error.message}`);
    // Don't fail the pool save if token auto-add fails
    return { added: false, symbol: tokenSymbol };
  }
}

export const savePoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { address: string };
    Querystring: { chainNetwork: string };
    Reply: { message: string; pool: Pool; tokensAdded?: string[] };
  }>(
    '/save/:address',
    {
      schema: {
        description: 'Find pool from GeckoTerminal and save it to the pool list. Auto-adds missing tokens.',
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
      const { chainNetwork } = request.query;

      try {
        // Parse chainNetwork to get chain and network
        const coinGeckoService = CoinGeckoService.getInstance();
        const { chain, network } = coinGeckoService.parseChainNetwork(chainNetwork);

        // Fetch detailed pool information using shared helper
        const { poolData, pool } = await fetchDetailedPoolInfo(chainNetwork, address);

        // Auto-save tokens if they don't exist and get the correct symbols
        const tokensAdded: string[] = [];

        const baseResult = await autoSaveTokenIfMissing(
          chain,
          network,
          chainNetwork,
          pool.baseTokenAddress,
          pool.baseSymbol,
        );
        if (baseResult.added) {
          tokensAdded.push(baseResult.symbol);
        }
        // Update pool with correct base symbol (in case it was resolved from GeckoTerminal)
        pool.baseSymbol = baseResult.symbol;

        const quoteResult = await autoSaveTokenIfMissing(
          chain,
          network,
          chainNetwork,
          pool.quoteTokenAddress,
          pool.quoteSymbol,
        );
        if (quoteResult.added) {
          tokensAdded.push(quoteResult.symbol);
        }
        // Update pool with correct quote symbol (in case it was resolved from GeckoTerminal)
        pool.quoteSymbol = quoteResult.symbol;

        // Check if pool already exists
        const poolService = PoolService.getInstance();
        const existingPool = await poolService.getPoolByAddress(chain, network, address);

        if (existingPool) {
          // Update existing pool with latest market data
          logger.info(
            `Pool ${pool.baseSymbol}-${pool.quoteSymbol} (${address}) already exists, updating with latest data`,
          );
          await poolService.updatePoolByAddress(chain, network, pool);

          const tokenMsg = tokensAdded.length > 0 ? ` (auto-added tokens: ${tokensAdded.join(', ')})` : '';
          return {
            message: `Pool ${pool.baseSymbol}-${pool.quoteSymbol} already exists in the pool list for ${chain}/${network}, updated with latest data${tokenMsg}`,
            pool,
            tokensAdded: tokensAdded.length > 0 ? tokensAdded : undefined,
          };
        }

        // Add pool to the list
        await poolService.addPool(chain, network, pool);
        logger.info(
          `Saved pool ${pool.baseSymbol}-${pool.quoteSymbol} (${address}) to ${chain}/${network} ${poolData.type}`,
        );

        const tokenMsg = tokensAdded.length > 0 ? ` (auto-added tokens: ${tokensAdded.join(', ')})` : '';
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

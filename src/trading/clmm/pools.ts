import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getEthereumNetworkConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaNetworkConfig } from '../../chains/solana/solana.config';
import { getPoolInfo as meteoraGetPoolInfo } from '../../connectors/meteora/clmm-routes/poolInfo';
import { getPoolInfo as orcaGetPoolInfo } from '../../connectors/orca/clmm-routes/poolInfo';
import { getPoolInfo as pancakeswapGetPoolInfo } from '../../connectors/pancakeswap/clmm-routes/poolInfo';
import { getPoolInfo as pancakeswapSolGetPoolInfo } from '../../connectors/pancakeswap-sol/clmm-routes/poolInfo';
import { getPoolInfo as raydiumGetPoolInfo } from '../../connectors/raydium/clmm-routes/poolInfo';
import { getPoolInfo as uniswapGetPoolInfo } from '../../connectors/uniswap/clmm-routes/poolInfo';
import { PoolInfo, PoolInfoSchema } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';
import { chainNetworkField, CLMM_CONNECTORS, connectorField, parseChainNetwork, rethrowRouteError } from '../common';

// Constants for examples (using Meteora CLMM values)
const CLMM_POOL_ADDRESS_EXAMPLE = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

/**
 * Unified pool info request schema
 */
const UnifiedPoolInfoRequestSchema = Type.Object({
  connector: connectorField(CLMM_CONNECTORS, 'CLMM connector'),
  chainNetwork: chainNetworkField(),
  poolAddress: Type.String({
    description: 'Pool contract address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  binCount: Type.Optional(
    Type.Integer({
      description:
        'If > 0, include a `bins` array of per-tick liquidity around the active tick. Supported by ' +
        'every connector except Meteora, which always returns its bins and ignores this. ' +
        'Default 0 = skip the bin fetch.',
      default: 0,
      minimum: 0,
      maximum: 401,
    }),
  ),
});

type UnifiedPoolInfoRequest = Static<typeof UnifiedPoolInfoRequestSchema>;

/**
 * Get pool info from Solana connectors
 */
async function getSolanaPoolInfo(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  poolAddress: string,
  binCount: number,
): Promise<PoolInfo> {
  logger.info(`[CLMM] Getting pool info from ${connector} on solana/${network}`);

  switch (connector) {
    case 'raydium':
      return await raydiumGetPoolInfo(fastify, network, poolAddress, binCount);
    case 'meteora':
      // Meteora always returns its bins; it has no binCount parameter.
      return await meteoraGetPoolInfo(fastify, network, poolAddress);
    case 'pancakeswap-sol':
      return await pancakeswapSolGetPoolInfo(fastify, network, poolAddress, binCount);
    case 'orca':
      return await orcaGetPoolInfo(fastify, network, poolAddress, binCount);
    default:
      throw fastify.httpErrors.badRequest(`Unsupported Solana CLMM connector: ${connector}`);
  }
}

/**
 * Get pool info from Ethereum connectors
 */
async function getEthereumPoolInfo(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  poolAddress: string,
  binCount: number,
): Promise<PoolInfo> {
  logger.info(`[CLMM] Getting pool info from ${connector} on ethereum/${network}`);

  switch (connector) {
    case 'uniswap':
      return await uniswapGetPoolInfo(fastify, network, poolAddress, binCount);
    case 'pancakeswap':
      return await pancakeswapGetPoolInfo(fastify, network, poolAddress, binCount);
    default:
      throw fastify.httpErrors.badRequest(`Unsupported Ethereum CLMM connector: ${connector}`);
  }
}

/**
 * Get pool info across any supported CLMM connector
 */
export async function getUnifiedPoolInfo(
  fastify: FastifyInstance,
  connector: string,
  chainNetwork: string,
  poolAddress: string,
  binCount: number = 0,
): Promise<PoolInfo> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedCLMM] Getting pool info for ${poolAddress} using ${connector} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumPoolInfo(fastify, connector, network, poolAddress, binCount);

    case 'solana':
      return getSolanaPoolInfo(fastify, connector, network, poolAddress, binCount);

    default:
      throw fastify.httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified CLMM pool info route
 * GET /trading/clmm/pool-info
 */
export const poolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: UnifiedPoolInfoRequest;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from any supported connector',
        tags: ['/trading/clmm'],
        querystring: UnifiedPoolInfoRequestSchema,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request, reply) => {
      const { connector, chainNetwork, poolAddress, binCount = 0 } = request.query;

      try {
        const result = await getUnifiedPoolInfo(fastify, connector, chainNetwork, poolAddress, binCount);
        return reply.code(200).send(result);
      } catch (error: any) {
        rethrowRouteError(error, 'Failed to get CLMM pool info');
      }
    },
  );
};

export default poolsRoute;

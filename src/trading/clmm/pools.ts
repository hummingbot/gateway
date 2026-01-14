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

// Constants for examples (using Meteora CLMM values)
const CLMM_POOL_ADDRESS_EXAMPLE = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

/**
 * Unified pool info request schema
 */
const UnifiedPoolInfoRequestSchema = Type.Object({
  connector: Type.String({
    description: 'CLMM connector (raydium, meteora, pancakeswap-sol, uniswap, pancakeswap, orca)',
    enum: ['raydium', 'meteora', 'pancakeswap-sol', 'uniswap', 'pancakeswap', 'orca'],
    default: 'meteora',
    examples: ['meteora'],
  }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
    examples: ['solana-mainnet-beta'],
  }),
  poolAddress: Type.String({
    description: 'Pool contract address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
});

type UnifiedPoolInfoRequest = Static<typeof UnifiedPoolInfoRequestSchema>;

/**
 * Parse chain-network parameter into chain and network
 */
function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const parts = chainNetwork.split('-');

  if (parts.length < 2) {
    throw new Error(
      `Invalid chain-network format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)`,
    );
  }

  const chain = parts[0];
  const network = parts.slice(1).join('-');

  return { chain, network };
}

/**
 * Get pool info from Solana connectors
 */
async function getSolanaPoolInfo(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  poolAddress: string,
): Promise<PoolInfo> {
  logger.info(`[CLMM] Getting pool info from ${connector} on solana/${network}`);

  switch (connector) {
    case 'raydium':
      return await raydiumGetPoolInfo(fastify, network, poolAddress);
    case 'meteora':
      return await meteoraGetPoolInfo(fastify, network, poolAddress);
    case 'pancakeswap-sol':
      return await pancakeswapSolGetPoolInfo(fastify, network, poolAddress);
    case 'orca':
      return await orcaGetPoolInfo(fastify, network, poolAddress);
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
): Promise<PoolInfo> {
  logger.info(`[CLMM] Getting pool info from ${connector} on ethereum/${network}`);

  switch (connector) {
    case 'uniswap':
      return await uniswapGetPoolInfo(fastify, network, poolAddress);
    case 'pancakeswap':
      return await pancakeswapGetPoolInfo(fastify, network, poolAddress);
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
): Promise<PoolInfo> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedCLMM] Getting pool info for ${poolAddress} using ${connector} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumPoolInfo(fastify, connector, network, poolAddress);

    case 'solana':
      return getSolanaPoolInfo(fastify, connector, network, poolAddress);

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
      const { connector, chainNetwork, poolAddress } = request.query;

      try {
        const result = await getUnifiedPoolInfo(fastify, connector, chainNetwork, poolAddress);
        return reply.code(200).send(result);
      } catch (error: any) {
        logger.error(`[UnifiedCLMM] Pool info error: ${error.message}`);
        throw error;
      }
    },
  );
};

export default poolsRoute;

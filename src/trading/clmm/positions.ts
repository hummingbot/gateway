import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { getPositionInfo as meteoraGetPositionInfo } from '../../connectors/meteora/clmm-routes/positionInfo';
import { getPositionInfo as pancakeswapGetPositionInfo } from '../../connectors/pancakeswap/clmm-routes/positionInfo';
import { getPositionInfo as pancakeswapSolGetPositionInfo } from '../../connectors/pancakeswap-sol/clmm-routes/positionInfo';
import { getPositionInfo as raydiumGetPositionInfo } from '../../connectors/raydium/clmm-routes/positionInfo';
import { getPositionInfo as uniswapGetPositionInfo } from '../../connectors/uniswap/clmm-routes/positionInfo';
import { PositionInfo, PositionInfoSchema } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

// Get default wallet from Solana config, fallback to Ethereum if Solana doesn't exist
let defaultWallet: string;
try {
  const solanaChainConfig = getSolanaChainConfig();
  defaultWallet = solanaChainConfig.defaultWallet;
} catch {
  const ethereumChainConfig = getEthereumChainConfig();
  defaultWallet = ethereumChainConfig.defaultWallet;
}

/**
 * Unified position info request schema
 */
const UnifiedPositionInfoRequestSchema = Type.Object({
  connector: Type.String({
    description: 'CLMM connector (raydium, meteora, pancakeswap-sol, uniswap, pancakeswap)',
    enum: ['raydium', 'meteora', 'pancakeswap-sol', 'uniswap', 'pancakeswap'],
    default: 'meteora',
    examples: ['meteora'],
  }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
    examples: ['solana-mainnet-beta'],
  }),
  positionAddress: Type.String({
    description: 'Position address or NFT token ID',
    examples: ['<sample-position-address>'],
  }),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address (optional for all connectors)',
      default: defaultWallet,
    }),
  ),
});

type UnifiedPositionInfoRequest = Static<typeof UnifiedPositionInfoRequestSchema>;

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
 * Get position info from Solana connectors
 */
async function getSolanaPositionInfo(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  positionAddress: string,
  _walletAddress?: string,
): Promise<PositionInfo> {
  logger.info(`[CLMM] Getting position info from ${connector} on solana/${network}`);

  switch (connector) {
    case 'raydium':
      return await raydiumGetPositionInfo(fastify, network, positionAddress);
    case 'meteora':
      return await meteoraGetPositionInfo(fastify, network, positionAddress);
    case 'pancakeswap-sol':
      return await pancakeswapSolGetPositionInfo(fastify, network, positionAddress);
    default:
      throw fastify.httpErrors.badRequest(`Unsupported Solana CLMM connector: ${connector}`);
  }
}

/**
 * Get position info from Ethereum connectors
 */
async function getEthereumPositionInfo(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  positionAddress: string,
  walletAddress?: string,
): Promise<PositionInfo> {
  logger.info(`[CLMM] Getting position info from ${connector} on ethereum/${network}`);

  switch (connector) {
    case 'uniswap':
      return await uniswapGetPositionInfo(fastify, network, positionAddress, walletAddress);
    case 'pancakeswap':
      return await pancakeswapGetPositionInfo(fastify, network, positionAddress, walletAddress);
    default:
      throw fastify.httpErrors.badRequest(`Unsupported Ethereum CLMM connector: ${connector}`);
  }
}

/**
 * Get position info across any supported CLMM connector
 */
export async function getUnifiedPositionInfo(
  fastify: FastifyInstance,
  connector: string,
  chainNetwork: string,
  positionAddress: string,
  walletAddress?: string,
): Promise<PositionInfo> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedCLMM] Getting position info for ${positionAddress} using ${connector} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumPositionInfo(fastify, connector, network, positionAddress, walletAddress);

    case 'solana':
      return getSolanaPositionInfo(fastify, connector, network, positionAddress, walletAddress);

    default:
      throw fastify.httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified CLMM position info route
 * GET /trading/clmm/position-info
 */
export const positionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: UnifiedPositionInfoRequest;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get CLMM position information from any supported connector',
        tags: ['/trading/clmm'],
        querystring: UnifiedPositionInfoRequestSchema,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request, reply) => {
      const { connector, chainNetwork, positionAddress, walletAddress } = request.query;

      try {
        const result = await getUnifiedPositionInfo(fastify, connector, chainNetwork, positionAddress, walletAddress);
        return reply.code(200).send(result);
      } catch (error: any) {
        logger.error(`[UnifiedCLMM] Position info error: ${error.message}`);
        throw error;
      }
    },
  );
};

export default positionsRoute;

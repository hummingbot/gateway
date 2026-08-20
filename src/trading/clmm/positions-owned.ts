import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getPositionsOwned as meteoraGetPositionsOwned } from '../../connectors/meteora/clmm-routes/positionsOwned';
import { getPositionsOwned as orcaGetPositionsOwned } from '../../connectors/orca/clmm-routes/positionsOwned';
import { getPositionsOwned as pancakeswapGetPositionsOwned } from '../../connectors/pancakeswap/clmm-routes/positionsOwned';
import { getPositionsOwned as pancakeswapSolGetPositionsOwned } from '../../connectors/pancakeswap-sol/clmm-routes/positionsOwned';
import { getPositionsOwned as raydiumGetPositionsOwned } from '../../connectors/raydium/clmm-routes/positionsOwned';
import { getPositionsOwned as uniswapGetPositionsOwned } from '../../connectors/uniswap/clmm-routes/positionsOwned';
import { PositionInfo, PositionInfoSchema } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';
import {
  chainNetworkField,
  CLMM_CONNECTORS,
  connectorField,
  defaultWallet,
  parseChainNetwork,
  rethrowRouteError,
} from '../common';

/**
 * Unified positions owned request schema
 */
export const UnifiedPositionsOwnedRequestSchema = Type.Object(
  {
    connector: connectorField(CLMM_CONNECTORS, 'CLMM connector'),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({
      description: 'Wallet address',
      default: defaultWallet,
    }),
  },
  { $id: 'ClmmPositionsOwnedRequest', additionalProperties: false },
);

type UnifiedPositionsOwnedRequest = Static<typeof UnifiedPositionsOwnedRequestSchema>;

/**
 * Get positions owned from Solana connectors
 */
async function getSolanaPositionsOwned(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  walletAddress?: string,
): Promise<PositionInfo[]> {
  logger.info(`[CLMM] Getting positions owned from ${connector} on solana/${network}`);

  switch (connector) {
    case 'raydium':
      return await raydiumGetPositionsOwned(fastify, network, walletAddress);
    case 'meteora':
      return await meteoraGetPositionsOwned(fastify, network, walletAddress);
    case 'pancakeswap-sol':
      return await pancakeswapSolGetPositionsOwned(fastify, network, walletAddress);
    case 'orca':
      return await orcaGetPositionsOwned(fastify, network, walletAddress);
    default:
      throw fastify.httpErrors.badRequest(`Unsupported Solana CLMM connector: ${connector}`);
  }
}

/**
 * Get positions owned from Ethereum connectors
 */
async function getEthereumPositionsOwned(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  walletAddress?: string,
): Promise<PositionInfo[]> {
  logger.info(`[CLMM] Getting positions owned from ${connector} on ethereum/${network}`);

  switch (connector) {
    case 'uniswap':
      return await uniswapGetPositionsOwned(fastify, network, walletAddress);
    case 'pancakeswap':
      return await pancakeswapGetPositionsOwned(fastify, network, walletAddress);
    default:
      throw fastify.httpErrors.badRequest(`Unsupported Ethereum CLMM connector: ${connector}`);
  }
}

/**
 * Get positions owned across any supported CLMM connector
 */
export async function getUnifiedPositionsOwned(
  fastify: FastifyInstance,
  connector: string,
  chainNetwork: string,
  walletAddress?: string,
): Promise<PositionInfo[]> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedCLMM] Getting positions owned using ${connector} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumPositionsOwned(fastify, connector, network, walletAddress);

    case 'solana':
      return getSolanaPositionsOwned(fastify, connector, network, walletAddress);

    default:
      throw fastify.httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified CLMM positions owned route
 * GET /trading/clmm/positions-owned
 */
export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: UnifiedPositionsOwnedRequest;
    Reply: PositionInfo[];
  }>(
    '/positions-owned',
    {
      schema: {
        description: 'Get all CLMM positions owned by a wallet from any supported connector',
        tags: ['/trading/clmm'],
        querystring: UnifiedPositionsOwnedRequestSchema,
        response: {
          200: Type.Array(PositionInfoSchema),
        },
      },
    },
    async (request, reply) => {
      const { connector, chainNetwork, walletAddress } = request.query;

      try {
        const result = await getUnifiedPositionsOwned(fastify, connector, chainNetwork, walletAddress);
        return reply.code(200).send(result);
      } catch (error: any) {
        rethrowRouteError(error, 'Failed to list CLMM positions owned');
      }
    },
  );
};

export default positionsOwnedRoute;

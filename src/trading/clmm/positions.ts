import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getPositionInfo as meteoraGetPositionInfo } from '../../connectors/meteora/clmm-routes/positionInfo';
import { getPositionInfo as orcaGetPositionInfo } from '../../connectors/orca/clmm-routes/positionInfo';
import { getPositionInfo as pancakeswapGetPositionInfo } from '../../connectors/pancakeswap/clmm-routes/positionInfo';
import { getPositionInfo as pancakeswapSolGetPositionInfo } from '../../connectors/pancakeswap-sol/clmm-routes/positionInfo';
import { getPositionInfo as raydiumGetPositionInfo } from '../../connectors/raydium/clmm-routes/positionInfo';
import { getPositionInfo as uniswapGetPositionInfo } from '../../connectors/uniswap/clmm-routes/positionInfo';
import { PositionInfo, PositionInfoSchema } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';
import { chainNetworkField, CLMM_CONNECTORS, connectorField, parseChainNetwork, rethrowRouteError } from '../common';

/**
 * Unified position info request schema
 */
const UnifiedPositionInfoRequestSchema = Type.Object({
  connector: connectorField(CLMM_CONNECTORS, 'CLMM connector'),
  chainNetwork: chainNetworkField(),
  positionAddress: Type.String({
    description: 'Position address or NFT token ID',
    examples: ['<sample-position-address>'],
  }),
});

type UnifiedPositionInfoRequest = Static<typeof UnifiedPositionInfoRequestSchema>;

/**
 * Get position info from Solana connectors
 */
async function getSolanaPositionInfo(
  fastify: FastifyInstance,
  connector: string,
  network: string,
  positionAddress: string,
): Promise<PositionInfo> {
  logger.info(`[CLMM] Getting position info from ${connector} on solana/${network}`);

  switch (connector) {
    case 'raydium':
      return await raydiumGetPositionInfo(fastify, network, positionAddress);
    case 'meteora':
      return await meteoraGetPositionInfo(fastify, network, positionAddress);
    case 'pancakeswap-sol':
      return await pancakeswapSolGetPositionInfo(fastify, network, positionAddress);
    case 'orca':
      return await orcaGetPositionInfo(fastify, network, positionAddress);
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
): Promise<PositionInfo> {
  logger.info(`[CLMM] Getting position info from ${connector} on ethereum/${network}`);

  switch (connector) {
    case 'uniswap':
      return await uniswapGetPositionInfo(fastify, network, positionAddress);
    case 'pancakeswap':
      return await pancakeswapGetPositionInfo(fastify, network, positionAddress);
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
): Promise<PositionInfo> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedCLMM] Getting position info for ${positionAddress} using ${connector} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumPositionInfo(fastify, connector, network, positionAddress);

    case 'solana':
      return getSolanaPositionInfo(fastify, connector, network, positionAddress);

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
      const { connector, chainNetwork, positionAddress } = request.query;

      try {
        const result = await getUnifiedPositionInfo(fastify, connector, chainNetwork, positionAddress);
        return reply.code(200).send(result);
      } catch (error: any) {
        rethrowRouteError(error, 'Failed to get CLMM position info');
      }
    },
  );
};

export default positionsRoute;

/**
 * The pool a position belongs to, for stamping onto a write's result.
 *
 * The CLMM write routes are position-addressed — they never receive a pool — so this
 * is the only way their responses can name the venue they acted on. It must run
 * BEFORE the write: after a close the position is gone and the lookup would fail.
 *
 * Best-effort by design. The identifier is a convenience on the response; a lookup
 * that fails must not fail the liquidity operation the caller actually asked for, so
 * it is logged and the field is simply absent.
 */
export async function getPositionPool(
  fastify: FastifyInstance,
  connector: string,
  chainNetwork: string,
  positionAddress: string,
): Promise<string | undefined> {
  try {
    const info = await getUnifiedPositionInfo(fastify, connector, chainNetwork, positionAddress);
    return info.poolAddress;
  } catch (e: any) {
    logger.warn(
      `Could not resolve the pool for position ${positionAddress} on ${connector}; ` +
        `the response will omit poolAddress: ${e?.message ?? e}`,
    );
    return undefined;
  }
}

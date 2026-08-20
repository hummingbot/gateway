import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { FetchPoolsResponse } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';
import { chainNetworkField, connectorField, parseChainNetwork, rethrowRouteError } from '../common';
import { FETCH_POOLS_CONNECTORS, getFetchPoolsOps } from '../connector-registry';

/**
 * Pool discovery against a DEX's own listing API, unified across connectors.
 *
 * The response shape was already shared; only the query knobs differed, so they
 * are collected here as optional fields tagged with the connectors that honor
 * them. A knob the chosen connector ignores is dropped rather than erroring,
 * matching how the other unified routes treat connector-specific parameters.
 */
export const FetchPoolsRequestSchema = Type.Object(
  {
    chainNetwork: chainNetworkField(),
    connector: connectorField(FETCH_POOLS_CONNECTORS, 'CLMM connector whose pool-discovery API to query'),
    limit: Type.Optional(
      Type.Number({ minimum: 1, maximum: 1000, default: 50, description: 'Maximum number of pools to return' }),
    ),
    query: Type.Optional(
      Type.String({ description: 'Search pools by name, token, or address', examples: ['SOL', 'SOL-USDC'] }),
    ),
    sortBy: Type.Optional(
      Type.String({
        description:
          'Sort field. Meteora takes a "field:direction" pair; Orca takes the field alone with sortDirection.',
        examples: ['tvl', 'tvl:desc'],
      }),
    ),
    page: Type.Optional(
      Type.Number({
        minimum: 0,
        description: '0-based page index. Only connectors whose API paginates honor this.',
        'x-connectors': ['meteora'],
      } as any),
    ),
    includeUnverified: Type.Optional(
      Type.Boolean({ description: 'Include unverified pools', 'x-connectors': ['meteora'] } as any),
    ),
    sortDirection: Type.Optional(
      Type.String({ description: 'Sort direction', enum: ['asc', 'desc'], 'x-connectors': ['orca'] } as any),
    ),
    verifiedOnly: Type.Optional(
      Type.Boolean({ description: 'Return only verified pools', 'x-connectors': ['orca'] } as any),
    ),
  },
  { $id: 'ClmmFetchPoolsRequest' },
);

type FetchPoolsRequest = Static<typeof FetchPoolsRequestSchema>;

export const fetchPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/fetch-pools',
    {
      schema: {
        description: "Discover pools from a CLMM connector's own pool-listing API",
        tags: ['/trading/clmm'],
        querystring: FetchPoolsRequestSchema,
        response: { 200: FetchPoolsResponse },
      },
    },
    async (request, reply) => {
      const { chainNetwork, connector, limit, query, sortBy, page, includeUnverified, sortDirection, verifiedOnly } =
        request.query as FetchPoolsRequest;

      try {
        const { chain, network } = parseChainNetwork(chainNetwork);

        logger.info(`[trading/clmm] fetch-pools on ${chain}/${network} via ${connector}`);

        const fetchPools = getFetchPoolsOps(connector, chain);
        const result = await fetchPools({
          network,
          limit,
          query,
          sortBy,
          page,
          includeUnverified,
          sortDirection,
          verifiedOnly,
        });
        return reply.code(200).send(result);
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to fetch pools');
      }
    },
  );
};

export default fetchPoolsRoute;

import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getPoolInfo as meteoraGetPoolInfo } from '../../connectors/meteora/launch-routes/poolInfo';
import { getPoolInfo as pumpGetPoolInfo } from '../../connectors/pump/launch-routes/poolInfo';
import { getPoolInfo as raydiumGetPoolInfo } from '../../connectors/raydium/launch-routes/poolInfo';
import { LaunchPoolInfoResponse, LaunchPoolInfoResponseType } from '../../schemas/launch-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { chainNetworkField, connectorField, parseChainNetwork, rethrowRouteError } from '../common';
import { LAUNCH_CONNECTORS, assertLaunchConnectorOnChain } from '../connector-registry';

/** Launchpads whose curve is a per-token pool account with state worth reading. */
export const LAUNCH_POOL_INFO_CONNECTORS = ['meteora', 'raydium', 'pump'];

export const LaunchPoolInfoRequestSchema = Type.Object(
  {
    connector: connectorField(LAUNCH_CONNECTORS, 'Launchpad connector', { defaulted: false }),
    chainNetwork: chainNetworkField(),
    poolAddress: Type.Optional(Type.String({ description: 'Pool account address. Pass this or baseMint.' })),
    baseMint: Type.Optional(
      Type.String({ description: 'Base token mint; the pool is resolved from it. Pass this or poolAddress.' }),
    ),
  },
  { $id: 'LaunchPoolInfoRequest', additionalProperties: false },
);

type LaunchPoolInfoRequest = Static<typeof LaunchPoolInfoRequestSchema>;

/** Pool info from a launchpad whose token lives on a per-token curve. */
export async function getLaunchPoolInfo(
  connector: string,
  network: string,
  selector: { poolAddress?: string; baseMint?: string },
): Promise<LaunchPoolInfoResponseType> {
  switch (connector) {
    case 'meteora':
      return await meteoraGetPoolInfo(network, selector);
    case 'raydium':
      return await raydiumGetPoolInfo(network, selector);
    case 'pump':
      return await pumpGetPoolInfo(network, selector);
    default:
      throw httpErrors.badRequest(
        `Connector '${connector}' does not expose launch pool info. Supported: ${LAUNCH_POOL_INFO_CONNECTORS.join(', ')}`,
      );
  }
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: LaunchPoolInfoRequest; Reply: LaunchPoolInfoResponseType }>(
    '/pool-info',
    {
      schema: {
        description:
          'Pool state for a launchpad whose venue is a per-token curve (Meteora DBC virtual pools, Raydium ' +
          'LaunchLab pools): reserves, ' +
          'curve progress toward migration, price and accrued fees. Select by poolAddress or baseMint.',
        tags: ['/trading/launch'],
        querystring: LaunchPoolInfoRequestSchema,
        response: { 200: LaunchPoolInfoResponse },
      },
    },
    async (request) => {
      const { connector, chainNetwork, poolAddress, baseMint } = request.query;
      try {
        const { chain, network } = parseChainNetwork(chainNetwork);
        assertLaunchConnectorOnChain(connector, chain); // rejects a connector that does not run on this chain
        logger.info(`[trading/launch] pool-info ${poolAddress ?? baseMint} on ${chain}/${network} via ${connector}`);
        return await getLaunchPoolInfo(connector, network, { poolAddress, baseMint });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to get launch pool info');
      }
    },
  );
};

export default poolInfoRoute;

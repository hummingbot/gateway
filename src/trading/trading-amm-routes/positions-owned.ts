import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getPositionsOwned as meteoraGetPositionsOwned } from '../../connectors/meteora/amm-routes/positionsOwned';
import { PositionInfo, PositionInfoSchema } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { AMM_CONNECTORS, parseChainNetwork, defaultWallet } from './common';

const UnifiedAmmPositionsOwnedRequest = Type.Object({
  connector: Type.String({ description: 'AMM connector (meteora)', default: 'meteora' }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta)',
    default: 'solana-mainnet-beta',
  }),
  walletAddress: Type.String({ description: 'Wallet address to list positions for', default: defaultWallet }),
});

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UnifiedAmmPositionsOwnedRequest>;
    Reply: PositionInfo[];
  }>(
    '/positions-owned',
    {
      schema: {
        description:
          'List all AMM positions a wallet owns across pools. Supported only for non-fungible-LP AMMs ' +
          '(meteora DAMM v2). Fungible-LP AMMs (raydium, uniswap, pancakeswap) have no enumerable ' +
          'positions — use position-info with a specific pool address instead.',
        tags: ['/trading/amm'],
        querystring: UnifiedAmmPositionsOwnedRequest,
        response: { 200: Type.Array(PositionInfoSchema) },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress } = request.query;
        const { network } = parseChainNetwork(chainNetwork);
        switch (connector) {
          case 'meteora':
            return await meteoraGetPositionsOwned(fastify, network, walletAddress);
          case 'raydium':
          case 'uniswap':
          case 'pancakeswap':
            throw httpErrors.badRequest(
              `positions-owned is not supported for ${connector}: fungible-LP AMMs have no enumerable ` +
                'positions. Use position-info with a specific pool address instead.',
            );
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        logger.error('Failed to list AMM positions owned:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to list positions owned');
      }
    },
  );
};

export default positionsOwnedRoute;

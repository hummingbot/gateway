import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getPoolInfo as meteoraGetPoolInfo } from '../../connectors/meteora/amm-routes/poolInfo';
import { getPoolInfo as raydiumGetPoolInfo } from '../../connectors/raydium/amm-routes/poolInfo';
import { getPoolInfo as uniswapGetPoolInfo } from '../../connectors/uniswap/amm-routes/poolInfo';
import { PoolInfo, PoolInfoSchema } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { AMM_CONNECTORS, parseChainNetwork } from './common';

const UnifiedAmmPoolInfoRequest = Type.Object({
  connector: Type.String({ description: 'AMM connector (meteora, raydium, uniswap)', default: 'meteora' }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
  }),
  poolAddress: Type.String({ description: 'Pool contract address' }),
});

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UnifiedAmmPoolInfoRequest>;
    Reply: PoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from any supported connector',
        tags: ['/trading/amm'],
        querystring: UnifiedAmmPoolInfoRequest,
        response: { 200: PoolInfoSchema },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, poolAddress } = request.query;
        const { network } = parseChainNetwork(chainNetwork);
        switch (connector) {
          case 'meteora':
            return await meteoraGetPoolInfo(network, poolAddress);
          case 'raydium':
            return await raydiumGetPoolInfo(network, poolAddress);
          case 'uniswap':
            return await uniswapGetPoolInfo(network, poolAddress);
          default:
            throw httpErrors.badRequest(
              `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
            );
        }
      } catch (e: any) {
        logger.error('Failed to get AMM pool info:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to get pool info');
      }
    },
  );
};

export default poolInfoRoute;

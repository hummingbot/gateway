import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { removeLiquidity as meteoraRemoveLiquidity } from '../../connectors/meteora/amm-routes/removeLiquidity';
import { removeLiquidity as pancakeswapRemoveLiquidity } from '../../connectors/pancakeswap/amm-routes/removeLiquidity';
import { removeLiquidity as raydiumRemoveLiquidity } from '../../connectors/raydium/amm-routes/removeLiquidity';
import { removeLiquidity as uniswapRemoveLiquidity } from '../../connectors/uniswap/amm-routes/removeLiquidity';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import {
  AMM_CONNECTORS,
  chainNetworkField,
  connectorField,
  defaultWallet,
  resolveChainNetwork,
  rethrowRouteError,
  withIdentifiers,
  slippagePctField,
} from '../common';

export const UnifiedAmmRemoveLiquidityRequest = Type.Object(
  {
    connector: connectorField(AMM_CONNECTORS, 'AMM connector'),
    chainNetwork: chainNetworkField(),
    walletAddress: Type.String({ description: 'Wallet address', default: defaultWallet }),
    poolAddress: Type.String({ description: 'Pool contract address' }),
    positionAddress: Type.Optional(
      Type.String({
        'x-connectors': ['meteora'],
        description:
          'Required for meteora (DAMM v2 positions are NFTs): the specific position to remove from. ' +
          'List positions with position-info or positions-owned. Ignored by fungible-LP AMMs.',
      }),
    ),
    percentageToRemove: Type.Number({
      format: 'decimal',
      minimum: 0,
      maximum: 100,
      description: 'Percentage of liquidity to remove',
      default: 100,
      examples: [100],
    }),
    slippagePct: slippagePctField(),
  },
  { $id: 'AmmRemoveRequest' },
);

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove',
    {
      schema: {
        description: 'Remove liquidity from an AMM pool from any supported connector',
        tags: ['/trading/amm'],
        body: UnifiedAmmRemoveLiquidityRequest,
        response: { 200: RemoveLiquidityResponse },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          poolAddress,
          positionAddress,
          percentageToRemove,
          slippagePct,
        } = request.body;
        const { network } = resolveChainNetwork(chainNetwork, connector, 'amm');
        const result = await (async () => {
          switch (connector) {
            case 'meteora':
              if (!positionAddress) {
                throw httpErrors.badRequest(
                  'positionAddress is required for meteora: DAMM v2 positions are NFTs and a wallet may hold ' +
                    'several per pool. List them with position-info or positions-owned.',
                );
              }
              return await meteoraRemoveLiquidity(
                network,
                walletAddress,
                poolAddress,
                positionAddress,
                percentageToRemove,
                slippagePct,
              );
            case 'raydium':
              return await raydiumRemoveLiquidity(network, walletAddress, poolAddress, percentageToRemove, slippagePct);
            case 'uniswap':
              return await uniswapRemoveLiquidity(network, walletAddress, poolAddress, percentageToRemove, slippagePct);
            case 'pancakeswap':
              return await pancakeswapRemoveLiquidity(
                network,
                walletAddress,
                poolAddress,
                percentageToRemove,
                slippagePct,
              );
            default:
              throw httpErrors.badRequest(
                `Unsupported AMM connector: ${connector}. Supported: ${AMM_CONNECTORS.join(', ')}`,
              );
          }
        })();

        return withIdentifiers(result, { poolAddress, positionAddress });
      } catch (e: any) {
        rethrowRouteError(e, 'Failed to remove AMM liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

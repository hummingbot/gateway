import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { removeLiquidity as meteoraRemoveLiquidity } from '../../connectors/meteora/amm-routes/removeLiquidity';
import { removeLiquidity as pancakeswapRemoveLiquidity } from '../../connectors/pancakeswap/amm-routes/removeLiquidity';
import { removeLiquidity as raydiumRemoveLiquidity } from '../../connectors/raydium/amm-routes/removeLiquidity';
import { removeLiquidity as uniswapRemoveLiquidity } from '../../connectors/uniswap/amm-routes/removeLiquidity';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { AMM_CONNECTORS, parseChainNetwork, defaultWallet } from './common';

const UnifiedAmmRemoveLiquidityRequest = Type.Object({
  connector: Type.String({ description: 'AMM connector (meteora, raydium, uniswap)', default: 'meteora' }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
  }),
  walletAddress: Type.String({ description: 'Wallet address', default: defaultWallet }),
  poolAddress: Type.String({ description: 'Pool contract address' }),
  positionAddress: Type.Optional(
    Type.String({
      description:
        'Required for meteora (DAMM v2 positions are NFTs): the specific position to remove from. ' +
        'List positions with position-info or positions-owned. Ignored by fungible-LP AMMs.',
    }),
  ),
  percentageToRemove: Type.Number({ minimum: 0, maximum: 100, description: 'Percentage of liquidity to remove' }),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
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
        const { network } = parseChainNetwork(chainNetwork);
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
      } catch (e: any) {
        logger.error('Failed to remove AMM liquidity:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

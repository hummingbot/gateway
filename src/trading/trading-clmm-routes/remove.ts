import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { removeLiquidity as meteoraRemoveLiquidity } from '../../connectors/meteora/clmm-routes/removeLiquidity';
import { removeLiquidity as pancakeswapRemoveLiquidity } from '../../connectors/pancakeswap/clmm-routes/removeLiquidity';
import { removeLiquidity as pancakeswapSolRemoveLiquidity } from '../../connectors/pancakeswap-sol/clmm-routes/removeLiquidity';
import { removeLiquidity as raydiumRemoveLiquidity } from '../../connectors/raydium/clmm-routes/removeLiquidity';
import { removeLiquidity as uniswapRemoveLiquidity } from '../../connectors/uniswap/clmm-routes/removeLiquidity';
import { RemoveLiquidityResponseType, RemoveLiquidityResponse } from '../../schemas/clmm-schema';
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

// Unified schema with connector field
const UnifiedRemoveLiquidityRequest = Type.Object({
  connector: Type.String({
    description: 'Connector name (uniswap, pancakeswap, raydium, meteora, pancakeswap-sol)',
    default: 'meteora',
    examples: ['meteora'],
  }),
  network: Type.String({
    description: 'Network name',
    default: 'mainnet-beta',
    examples: ['mainnet-beta'],
  }),
  walletAddress: Type.String({
    description: 'Wallet address',
    default: defaultWallet,
  }),
  positionAddress: Type.String({
    description: 'Position address',
    examples: ['<sample-position-address>'],
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
    default: 100,
    examples: [100],
  }),
});

// Import connector functions

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove',
    {
      schema: {
        description: 'Remove liquidity from a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { connector, network, walletAddress, positionAddress, percentageToRemove } = request.body;

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapRemoveLiquidity(fastify, network, walletAddress, positionAddress, percentageToRemove);

          case 'pancakeswap':
            return await pancakeswapRemoveLiquidity(
              fastify,
              network,
              walletAddress,
              positionAddress,
              percentageToRemove,
            );

          case 'raydium':
            return await raydiumRemoveLiquidity(fastify, network, walletAddress, positionAddress, percentageToRemove);

          case 'meteora':
            return await meteoraRemoveLiquidity(fastify, network, walletAddress, positionAddress, percentageToRemove);

          case 'pancakeswap-sol':
            return await pancakeswapSolRemoveLiquidity(
              fastify,
              network,
              walletAddress,
              positionAddress,
              percentageToRemove,
            );

          default:
            throw fastify.httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to remove liquidity:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

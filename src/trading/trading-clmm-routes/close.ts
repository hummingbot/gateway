import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { closePosition as meteoraClosePosition } from '../../connectors/meteora/clmm-routes/closePosition';
import { closePosition as orcaClosePosition } from '../../connectors/orca/clmm-routes/closePosition';
import { closePosition as pancakeswapClosePosition } from '../../connectors/pancakeswap/clmm-routes/closePosition';
import { closePosition as pancakeswapSolClosePosition } from '../../connectors/pancakeswap-sol/clmm-routes/closePosition';
import { closePosition as raydiumClosePosition } from '../../connectors/raydium/clmm-routes/closePosition';
import { closePosition as uniswapClosePosition } from '../../connectors/uniswap/clmm-routes/closePosition';
import { ClosePositionResponseType, ClosePositionResponse } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
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

// Unified schema with connector field
const UnifiedClosePositionRequest = Type.Object({
  connector: Type.String({
    description: 'Connector name (uniswap, pancakeswap, raydium, meteora, pancakeswap-sol, orca)',
    default: 'meteora',
    examples: ['meteora'],
  }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
    examples: ['solana-mainnet-beta'],
  }),
  walletAddress: Type.String({
    description: 'Wallet address',
    default: defaultWallet,
  }),
  positionAddress: Type.String({
    description: 'Position address',
    examples: ['<sample-position-address>'],
  }),
});

// Import connector functions

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close',
    {
      schema: {
        description: 'Close a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { connector, chainNetwork, walletAddress, positionAddress } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { network } = parseChainNetwork(chainNetwork);

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapClosePosition(network, walletAddress, positionAddress);

          case 'pancakeswap':
            return await pancakeswapClosePosition(network, walletAddress, positionAddress);

          case 'raydium':
            return await raydiumClosePosition(network, walletAddress, positionAddress);

          case 'meteora':
            return await meteoraClosePosition(network, walletAddress, positionAddress);

          case 'pancakeswap-sol':
            return await pancakeswapSolClosePosition(network, walletAddress, positionAddress);

          case 'orca':
            return await orcaClosePosition(network, walletAddress, positionAddress);

          default:
            throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to close position:', e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to close position');
      }
    },
  );
};

export default closePositionRoute;

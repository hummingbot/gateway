import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { collectFees as meteoraCollectFees } from '../../connectors/meteora/clmm-routes/collectFees';
import { collectFees as orcaCollectFees } from '../../connectors/orca/clmm-routes/collectFees';
import { collectFees as pancakeswapCollectFees } from '../../connectors/pancakeswap/clmm-routes/collectFees';
import { collectFees as pancakeswapSolCollectFees } from '../../connectors/pancakeswap-sol/clmm-routes/collectFees';
import { collectFees as raydiumCollectFees } from '../../connectors/raydium/clmm-routes/collectFees';
import { collectFees as uniswapCollectFees } from '../../connectors/uniswap/clmm-routes/collectFees';
import { CollectFeesResponseType, CollectFeesResponse } from '../../schemas/clmm-schema';
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
const UnifiedCollectFeesRequest = Type.Object({
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

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
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
            return await uniswapCollectFees(network, walletAddress, positionAddress);

          case 'pancakeswap':
            return await pancakeswapCollectFees(network, walletAddress, positionAddress);

          case 'raydium':
            return await raydiumCollectFees(network, walletAddress, positionAddress);

          case 'meteora':
            return await meteoraCollectFees(network, walletAddress, positionAddress);

          case 'pancakeswap-sol':
            return await pancakeswapSolCollectFees(network, walletAddress, positionAddress);

          case 'orca':
            return await orcaCollectFees(network, walletAddress, positionAddress);

          default:
            throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to collect fees:', e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;

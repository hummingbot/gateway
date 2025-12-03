import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { httpErrors } from '../../services/error-handler';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { Solana } from '../../chains/solana/solana';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';

// Get default wallet from Solana config, fallback to Ethereum if Solana doesn't exist
let defaultWallet: string;
try {
  const solanaChainConfig = getSolanaChainConfig();
  defaultWallet = solanaChainConfig.defaultWallet;
} catch {
  const ethereumChainConfig = getEthereumChainConfig();
  defaultWallet = ethereumChainConfig.defaultWallet;
}

// Constants for examples (using Meteora CLMM values)
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;
const LOWER_PRICE_BOUND = 150;
const UPPER_PRICE_BOUND = 250;
const CLMM_POOL_ADDRESS_EXAMPLE = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

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
const UnifiedOpenPositionRequest = Type.Object({
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
  lowerPrice: Type.Number({
    description: 'Lower price bound for the position',
    examples: [LOWER_PRICE_BOUND],
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
    examples: [UPPER_PRICE_BOUND],
  }),
  poolAddress: Type.String({
    description: 'Pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of base token to deposit',
      examples: [BASE_TOKEN_AMOUNT],
    }),
  ),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of quote token to deposit',
      examples: [QUOTE_TOKEN_AMOUNT],
    }),
  ),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: 1,
      examples: [1],
    }),
  ),
});

// Import connector functions
import { openPosition as meteoraOpenPosition } from '../../connectors/meteora/clmm-routes/openPosition';
import { openPosition as orcaOpenPosition } from '../../connectors/orca/clmm-routes/openPosition';
import { openPosition as pancakeswapOpenPosition } from '../../connectors/pancakeswap/clmm-routes/openPosition';
import { openPosition as pancakeswapSolOpenPosition } from '../../connectors/pancakeswap-sol/clmm-routes/openPosition';
import { openPosition as raydiumOpenPosition } from '../../connectors/raydium/clmm-routes/openPosition';
import { openPosition as uniswapOpenPosition } from '../../connectors/uniswap/clmm-routes/openPosition';
import { OpenPositionResponseType, OpenPositionResponse } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open',
    {
      schema: {
        description: 'Open a new CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { network } = parseChainNetwork(chainNetwork);

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapOpenPosition(
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'pancakeswap':
            return await pancakeswapOpenPosition(
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'raydium':
            return await raydiumOpenPosition(
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'meteora':
            return await meteoraOpenPosition(
              network,
              walletAddress,
              lowerPrice,
              upperPrice,
              poolAddress,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'pancakeswap-sol':
            return await pancakeswapSolOpenPosition(
              network,
              walletAddress,
              poolAddress,
              lowerPrice,
              upperPrice,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          case 'orca':
            return await orcaOpenPosition(
              network,
              walletAddress,
              poolAddress,
              lowerPrice,
              upperPrice,
              baseTokenAmount,
              quoteTokenAmount,
              slippagePct,
            );

          default:
            throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to open position:', e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to open position');
      }
    },
  );
};

export default openPositionRoute;

import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { addLiquidity as meteoraAddLiquidity } from '../../connectors/meteora/clmm-routes/addLiquidity';
import { addLiquidity as orcaAddLiquidity } from '../../connectors/orca/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapAddLiquidity } from '../../connectors/pancakeswap/clmm-routes/addLiquidity';
import { addLiquidity as pancakeswapSolAddLiquidity } from '../../connectors/pancakeswap-sol/clmm-routes/addLiquidity';
import { addLiquidity as raydiumAddLiquidity } from '../../connectors/raydium/clmm-routes/addLiquidity';
import { addLiquidity as uniswapAddLiquidity } from '../../connectors/uniswap/clmm-routes/addLiquidity';
import { AddLiquidityResponseType, AddLiquidityResponse } from '../../schemas/clmm-schema';
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

// Constants for examples (using Meteora CLMM values)
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;

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
const UnifiedAddLiquidityRequest = Type.Object({
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
  baseTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of base token to deposit (omit for single-sided quote deposit)',
      examples: [BASE_TOKEN_AMOUNT],
    }),
  ),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of quote token to deposit (omit for single-sided base deposit)',
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

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add',
    {
      schema: {
        description: 'Add liquidity to an existing CLMM position across supported connectors',
        tags: ['/trading/clmm'],
        body: UnifiedAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        // Parse chain and network from chainNetwork parameter
        const { network } = parseChainNetwork(chainNetwork);

        // Single-sided deposits are valid; the omitted side deposits 0.
        const baseAmount = baseTokenAmount ?? 0;
        const quoteAmount = quoteTokenAmount ?? 0;
        if (baseAmount <= 0 && quoteAmount <= 0) {
          throw httpErrors.badRequest('At least one of baseTokenAmount or quoteTokenAmount must be greater than 0');
        }

        // Route to appropriate connector
        switch (connector) {
          case 'uniswap':
            return await uniswapAddLiquidity(
              network,
              walletAddress,
              positionAddress,
              baseAmount,
              quoteAmount,
              slippagePct,
            );

          case 'pancakeswap':
            return await pancakeswapAddLiquidity(
              network,
              walletAddress,
              positionAddress,
              baseAmount,
              quoteAmount,
              slippagePct,
            );

          case 'raydium':
            return await raydiumAddLiquidity(
              network,
              walletAddress,
              positionAddress,
              baseAmount,
              quoteAmount,
              slippagePct,
            );

          case 'meteora':
            return await meteoraAddLiquidity(
              network,
              walletAddress,
              positionAddress,
              baseAmount,
              quoteAmount,
              slippagePct,
            );

          case 'pancakeswap-sol':
            return await pancakeswapSolAddLiquidity(
              network,
              walletAddress,
              positionAddress,
              baseAmount,
              quoteAmount,
              slippagePct,
            );

          case 'orca':
            return await orcaAddLiquidity(
              network,
              walletAddress,
              positionAddress,
              baseAmount,
              quoteAmount,
              slippagePct,
            );

          default:
            throw httpErrors.badRequest(`Unsupported connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to add liquidity:', e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;

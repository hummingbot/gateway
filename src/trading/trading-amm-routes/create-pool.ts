import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { createPool as meteoraCreatePool } from '../../connectors/meteora/amm-routes/createPool';
import { createPool as raydiumCreatePool } from '../../connectors/raydium/amm-routes/createPool';
import { createPool as uniswapCreatePool } from '../../connectors/uniswap/amm-routes/createPool';
import { CreatePoolResponse, CreatePoolResponseType } from '../../schemas/amm-schema';
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
 * Parse chain-network parameter into chain and network.
 */
function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const parts = chainNetwork.split('-');
  if (parts.length < 2) {
    throw new Error(
      `Invalid chain-network format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)`,
    );
  }
  return { chain: parts[0], network: parts.slice(1).join('-') };
}

// Unified schema with a connector field. Per-connector create-pool extras are optional
// and only consumed by their owning connector (configAddress → meteora, feeConfigIndex →
// raydium, gasPrice/maxGas/slippagePct → uniswap). See docs/connectors/meteora-damm-v2.md.
const UnifiedCreatePoolRequest = Type.Object({
  connector: Type.String({
    description: 'AMM connector name (meteora, raydium, uniswap)',
    default: 'meteora',
    examples: ['meteora'],
  }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
    examples: ['solana-mainnet-beta'],
  }),
  walletAddress: Type.String({
    description: 'Wallet address (pool creator + payer)',
    default: defaultWallet,
  }),
  baseToken: Type.String({ description: 'Base token symbol or address (becomes the pool base)' }),
  quoteToken: Type.String({ description: 'Quote token symbol or address (becomes the pool quote)' }),
  baseTokenAmount: Type.Number({ description: 'Amount of base token to seed the pool with' }),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description:
        'Amount of quote token to seed with. If provided, the base:quote ratio sets the initial price. ' +
        'If omitted (and no initialPrice), the price is fetched from the market.',
    }),
  ),
  initialPrice: Type.Optional(
    Type.Number({
      description:
        'Initial price as quote per base. Overrides quoteTokenAmount. If both are omitted, the current ' +
        'market price is fetched from the unified swap router so the pool opens on-market.',
    }),
  ),
  // Connector-specific create-pool params (optional; ignored by connectors that do not use them):
  configAddress: Type.Optional(
    Type.String({ description: 'Meteora DAMM v2 config account address (required for the meteora connector)' }),
  ),
  feeConfigIndex: Type.Optional(
    Type.Number({ description: 'Raydium CPMM fee config index (optional; defaults to the first available config)' }),
  ),
  openTime: Type.Optional(Type.Number({ description: 'Raydium CPMM pool open time (unix seconds; optional)' })),
  gasPrice: Type.Optional(Type.Number({ description: 'Uniswap (EVM) gas price in gwei (optional)' })),
  maxGas: Type.Optional(Type.Number({ description: 'Uniswap (EVM) max gas limit (optional)' })),
  slippagePct: Type.Optional(
    Type.Number({ minimum: 0, maximum: 100, description: 'Uniswap seeding slippage percentage (optional)' }),
  ),
});

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description:
          'Create and seed a new AMM pool across supported connectors (Meteora DAMM v2, Raydium CPMM, Uniswap V2)',
        tags: ['/trading/amm'],
        body: UnifiedCreatePoolRequest,
        response: {
          200: CreatePoolResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          connector,
          chainNetwork,
          walletAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          initialPrice,
          configAddress,
          feeConfigIndex,
          openTime,
          gasPrice,
          maxGas,
          slippagePct,
        } = request.body;

        const { network } = parseChainNetwork(chainNetwork);

        switch (connector) {
          case 'meteora':
            return await meteoraCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              configAddress,
              initialPrice,
            );

          case 'raydium':
            return await raydiumCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              initialPrice,
              feeConfigIndex,
              openTime,
            );

          case 'uniswap':
            return await uniswapCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              initialPrice,
              gasPrice,
              maxGas,
              slippagePct,
            );

          default:
            throw httpErrors.badRequest(`Unsupported AMM connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to create pool:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;

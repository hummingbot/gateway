import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { createPool as meteoraCreatePool } from '../../connectors/meteora/amm-routes/createPool';
import { createPool as pancakeswapCreatePool } from '../../connectors/pancakeswap/amm-routes/createPool';
import { createPool as raydiumCreatePool } from '../../connectors/raydium/amm-routes/createPool';
import { createPool as uniswapCreatePool } from '../../connectors/uniswap/amm-routes/createPool';
import { CreatePoolRequest, CreatePoolResponse, CreatePoolResponseType } from '../../schemas/amm-schema';
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

// Composed from the canonical CreatePoolRequest (schemas/amm-schema.ts): the
// unified route swaps per-connector `network` for connector + chainNetwork,
// defaults the wallet, and adds the per-protocol fee-config selectors.
const UnifiedCreatePoolRequest = Type.Composite([
  Type.Object({
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
  }),
  Type.Omit(CreatePoolRequest, ['network', 'walletAddress'], {}),
  // Optional per-protocol fee-config selectors, last so required fields lead the schema:
  Type.Object({
    configAddress: Type.Optional(
      Type.String({
        description:
          'Meteora DAMM v2 config account address (required for the meteora connector — configs are ' +
          'permissionless accounts with no index derivation, so the address must be explicit).',
      }),
    ),
    ammConfigIndex: Type.Optional(
      Type.Number({
        description: 'Raydium CPMM fee-config index (optional; defaults to the first available config).',
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Uniswap seeding slippage percentage',
        default: 1,
        examples: [1],
      }),
    ),
  }),
]);

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
          ammConfigIndex,
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
              ammConfigIndex,
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
              slippagePct,
            );

          case 'pancakeswap':
            return await pancakeswapCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              baseTokenAmount,
              quoteTokenAmount,
              initialPrice,
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

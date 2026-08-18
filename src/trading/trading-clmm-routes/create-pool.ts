import { Static, Type } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { createPool as meteoraCreatePool } from '../../connectors/meteora/clmm-routes/createPool';
import { createPool as orcaCreatePool } from '../../connectors/orca/clmm-routes/createPool';
import { createPool as pancakeswapCreatePool } from '../../connectors/pancakeswap/clmm-routes/createPool';
import { createPool as pancakeswapSolCreatePool } from '../../connectors/pancakeswap-sol/clmm-routes/createPool';
import { createPool as raydiumCreatePool } from '../../connectors/raydium/clmm-routes/createPool';
import { createPool as uniswapCreatePool } from '../../connectors/uniswap/clmm-routes/createPool';
import {
  CreatePoolResponse,
  CreatePoolResponseType,
  CreatePoolRequest as ClmmCreatePoolRequest,
} from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

// Get default wallet from Solana config, fallback to Ethereum if Solana doesn't exist
let defaultWallet: string;
try {
  defaultWallet = getSolanaChainConfig().defaultWallet;
} catch {
  defaultWallet = getEthereumChainConfig().defaultWallet;
}

function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const parts = chainNetwork.split('-');
  if (parts.length < 2) {
    throw new Error(
      `Invalid chain-network format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)`,
    );
  }
  return { chain: parts[0], network: parts.slice(1).join('-') };
}

// Unified CLMM create-pool. Creates + initializes a pool at an initial price (no position is
// seeded — concentrated-liquidity positions need a range, opened separately via open-position).
// Per-connector extras are optional and consumed only by their owning connector.
// Composed from the canonical ClmmCreatePoolRequest (schemas/clmm-schema.ts):
// the unified route swaps per-connector `network` for connector + chainNetwork
// and defaults the wallet.
const UnifiedClmmCreatePoolRequest = Type.Composite([
  Type.Object({
    connector: Type.String({
      description: 'CLMM connector name (meteora, raydium, uniswap, orca, pancakeswap, pancakeswap-sol)',
      default: 'meteora',
      examples: ['meteora'],
    }),
    chainNetwork: Type.String({
      description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
      default: 'solana-mainnet-beta',
      examples: ['solana-mainnet-beta'],
    }),
    walletAddress: Type.String({ description: 'Wallet address (pool creator + payer)', default: defaultWallet }),
  }),
  Type.Omit(ClmmCreatePoolRequest, ['network', 'walletAddress'], {}),
]);

export const createPoolRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof UnifiedClmmCreatePoolRequest>;
    Reply: CreatePoolResponseType;
  }>(
    '/create-pool',
    {
      schema: {
        description:
          'Create and initialize a new CLMM pool across supported connectors (Meteora DLMM, Raydium CLMM, Uniswap V3)',
        tags: ['/trading/clmm'],
        body: UnifiedClmmCreatePoolRequest,
        response: { 200: CreatePoolResponse },
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
          initialPrice,
          binStep,
          feeBps,
          ammConfigIndex,
        } = request.body;

        const { network } = parseChainNetwork(chainNetwork);

        // EVM V3 fee tiers are denominated in hundredths of a bip; feeBps is the
        // route's one fee vocabulary, so map it (1 bps -> 100).
        if ((connector === 'uniswap' || connector === 'pancakeswap') && feeBps === undefined) {
          throw httpErrors.badRequest(
            `feeBps is required for ${connector}: the V3 fee tier in basis points ` +
              '(1, 5, 30 or 100; pancakeswap also 25)',
          );
        }
        const evmFeeTier = feeBps === undefined ? undefined : feeBps * 100;

        switch (connector) {
          case 'meteora':
            return await meteoraCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              initialPrice,
              binStep,
              feeBps,
            );
          case 'raydium':
            return await raydiumCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, ammConfigIndex);
          case 'uniswap':
            return await uniswapCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, evmFeeTier);
          case 'orca':
            // Orca's fee tier IS its tick spacing — binStep is the route's one
            // granularity vocabulary.
            return await orcaCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, binStep);
          case 'pancakeswap':
            return await pancakeswapCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, evmFeeTier);
          case 'pancakeswap-sol':
            return await pancakeswapSolCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              initialPrice,
              ammConfigIndex,
            );
          default:
            throw httpErrors.badRequest(`Unsupported CLMM connector: ${connector}`);
        }
      } catch (e: any) {
        logger.error('Failed to create CLMM pool:', e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Failed to create pool');
      }
    },
  );
};

export default createPoolRoute;

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
import { CreatePoolResponse, CreatePoolResponseType } from '../../schemas/amm-schema';
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
const UnifiedClmmCreatePoolRequest = Type.Object({
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
  baseToken: Type.String({ description: 'Base token symbol or address' }),
  quoteToken: Type.String({ description: 'Quote token symbol or address' }),
  initialPrice: Type.Optional(
    Type.Number({
      description:
        'Initial pool price as quote per base. If omitted, the current market price is fetched from the ' +
        'unified swap router so the pool opens on-market.',
    }),
  ),
  // Connector-specific extras (optional; ignored by connectors that do not use them):
  binStep: Type.Optional(Type.Number({ description: 'Meteora DLMM bin step (bps)' })),
  feeBps: Type.Optional(Type.Number({ description: 'Meteora DLMM base fee (bps)' })),
  ammConfigIndex: Type.Optional(Type.Number({ description: 'Raydium CLMM AMM config index (fee tier)' })),
  fee: Type.Optional(
    Type.Number({
      description: 'V3 fee tier — Uniswap (100 | 500 | 3000 | 10000) or PancakeSwap (100 | 500 | 2500 | 10000)',
    }),
  ),
  tickSpacing: Type.Optional(Type.Number({ description: 'Orca Whirlpool tick spacing (fee tier)' })),
  ammConfig: Type.Optional(Type.String({ description: 'pancakeswap-sol CLMM amm_config account address (required)' })),
  gasPrice: Type.Optional(Type.Number({ description: 'EVM gas price in gwei (uniswap/pancakeswap)' })),
  maxGas: Type.Optional(Type.Number({ description: 'EVM max gas limit (uniswap/pancakeswap)' })),
});

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
          fee,
          tickSpacing,
          ammConfig,
          gasPrice,
          maxGas,
        } = request.body;

        const { network } = parseChainNetwork(chainNetwork);

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
            return await uniswapCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              initialPrice,
              fee,
              gasPrice,
              maxGas,
            );
          case 'orca':
            return await orcaCreatePool(network, walletAddress, baseToken, quoteToken, initialPrice, tickSpacing);
          case 'pancakeswap':
            return await pancakeswapCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              initialPrice,
              fee,
              gasPrice,
              maxGas,
            );
          case 'pancakeswap-sol':
            return await pancakeswapSolCreatePool(
              network,
              walletAddress,
              baseToken,
              quoteToken,
              initialPrice,
              ammConfig,
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

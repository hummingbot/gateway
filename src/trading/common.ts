import { Type } from '@sinclair/typebox';

import { getEthereumChainConfig } from '../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../chains/solana/solana.config';
import { httpErrors } from '../services/error-handler';

/** CLMM connectors that back the unified /trading/clmm routes. */
export const CLMM_CONNECTORS = ['meteora', 'raydium', 'pancakeswap-sol', 'orca', 'uniswap', 'pancakeswap'];

/** AMM connectors that back the unified /trading/amm routes. */
export const AMM_CONNECTORS = ['meteora', 'raydium', 'uniswap', 'pancakeswap'];

/** Connector selector: enum-constrained so unknown connectors are rejected at the schema. */
export const connectorField = (connectors: string[], label: string) =>
  Type.String({ description: label, enum: connectors, default: connectors[0], examples: [connectors[0]] });

/** Chain-network selector shared by every unified trading route. */
export const chainNetworkField = () =>
  Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
    examples: ['solana-mainnet-beta'],
  });

/** Parse a chain-network string (e.g. "solana-mainnet-beta") into its chain and network parts. */
export function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const parts = chainNetwork.split('-');
  if (parts.length < 2) {
    throw httpErrors.badRequest(
      `Invalid chain-network format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)`,
    );
  }
  return { chain: parts[0], network: parts.slice(1).join('-') };
}

// Default wallet from Solana config, falling back to Ethereum when Solana is unavailable.
let dw: string;
try {
  dw = getSolanaChainConfig().defaultWallet;
} catch {
  dw = getEthereumChainConfig().defaultWallet;
}
export const defaultWallet = dw;

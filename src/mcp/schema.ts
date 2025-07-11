import { z } from 'zod';

// NOTE: Gateway uses TypeBox (@sinclair/typebox) for schemas throughout the codebase.
// MCP uses Zod for its schemas. We maintain separate schemas here to avoid:
// 1. Adding TypeBox as a dependency to MCP
// 2. Complex type conversions between TypeBox and Zod
// 3. Tight coupling between MCP and Gateway's internal schemas
//
// These values MUST match the actual supported chains/networks/connectors in Gateway.
// When Gateway adds new chains/networks/connectors, update these enums accordingly.

// Chain parameter schemas
// Only two top-level chains are supported:
// - 'ethereum' for all EVM-compatible chains (mainnet, polygon, arbitrum, etc.)
// - 'solana' for Solana networks
export const ParamChain = z
  .enum(['ethereum', 'solana'])
  .describe('The blockchain to use (ethereum for all EVM chains, solana for Solana)');

// Network schemas - these match the actual networks supported by each chain
// Sources:
// - Ethereum networks: src/connectors/uniswap/uniswap.config.ts
// - Solana networks: src/connectors/jupiter/jupiter.config.ts
export const ParamEthereumNetwork = z
  .enum(['mainnet', 'sepolia', 'arbitrum', 'avalanche', 'base', 'bsc', 'celo', 'optimism', 'polygon'])
  .describe('Network for Ethereum/EVM chains');

export const ParamSolanaNetwork = z.enum(['mainnet-beta', 'devnet']).describe('Network for Solana');

// Union network type that accepts both
export const ParamNetwork = z
  .union([ParamEthereumNetwork, ParamSolanaNetwork])
  .describe('The specific network for the chain (e.g., mainnet, arbitrum for Ethereum, or mainnet-beta for Solana)');

// Connector schemas - these match the actual DEX connectors in Gateway
// Source: src/connectors/connector.routes.ts
export const ParamConnector = z
  .enum(['0x', 'uniswap', 'jupiter', 'meteora', 'raydium'])
  .describe('The DEX connector to use for trading operations');

// Address schemas
// Note: Gateway has wallet schemas in src/wallet/schemas.ts using TypeBox
export const ParamAddress = z
  .string()
  .trim()
  .describe('A wallet address (Ethereum format: 0x... or Solana format: base58)');

export const ParamTokenAddress = z
  .string()
  .trim()
  .describe('The contract address of a token (0x... for EVM chains, base58 for Solana)');

// Token schemas
export const ParamTokenSymbol = z
  .string()
  .trim()
  .toUpperCase()
  .describe('The symbol of a token (e.g., ETH, USDC, SOL)');

export const ParamAmount = z.string().trim().describe('The amount of tokens (as a string to preserve precision)');

// Swap parameters
// Note: Gateway has comprehensive trading schemas in src/schemas/router-schema.ts
// We define simplified versions here for MCP tool parameters
export const ParamSlippage = z
  .number()
  .min(0)
  .max(100)
  .optional()
  .describe('Maximum acceptable slippage percentage (0-100). Defaults to 1%');

export const ParamMaxFeePerGas = z.string().optional().describe('Maximum fee per gas in wei (EVM chains only)');

export const ParamMaxPriorityFeePerGas = z
  .string()
  .optional()
  .describe('Maximum priority fee per gas in wei (EVM chains only)');

export const ParamNonce = z.number().int().optional().describe('Transaction nonce (EVM chains only)');

// Configuration schemas
export const ParamConfigPath = z
  .string()
  .trim()
  .describe('Path to a configuration file (e.g., ethereum.yml, uniswap.yml)');

export const ParamConfigKey = z
  .string()
  .trim()
  .describe('The configuration key to update (dot notation supported, e.g., "server.port")');

export const ParamConfigValue = z.any().describe('The new value for the configuration key');

// Transaction schemas
export const ParamTxHash = z.string().trim().describe('Transaction hash to query');

export const ParamSwapSide = z
  .enum(['BUY', 'SELL'])
  .describe(
    'Whether to buy or sell the base token. BUY means buying the base token with quote token, SELL means selling base token for quote token',
  );

// Helper function to create optional versions of schemas
export function optional<T extends z.ZodTypeAny>(schema: T): z.ZodOptional<T> {
  return schema.optional();
}

// Common parameter groups for reuse
export const ChainNetworkParams = {
  chain: ParamChain,
  network: ParamNetwork,
};

// Helper to validate chain/network combinations
export function validateChainNetwork(chain: string, network: string): boolean {
  if (chain === 'ethereum') {
    return ParamEthereumNetwork.safeParse(network).success;
  } else if (chain === 'solana') {
    return ParamSolanaNetwork.safeParse(network).success;
  }
  return false;
}

export const SwapBaseParams = {
  chain: ParamChain,
  network: ParamNetwork,
  connector: ParamConnector,
  address: ParamAddress,
};

export const TokenPairParams = {
  base: ParamTokenSymbol,
  quote: ParamTokenSymbol,
};

export const GasParams = {
  maxFeePerGas: ParamMaxFeePerGas,
  maxPriorityFeePerGas: ParamMaxPriorityFeePerGas,
  nonce: ParamNonce,
};

// FUTURE IMPROVEMENTS:
// 1. Consider creating a shared schema package that can convert between TypeBox and Zod
// 2. Implement runtime validation to ensure MCP schemas stay in sync with Gateway
// 3. Generate these schemas from Gateway's TypeBox schemas using code generation
// 4. Add unit tests that verify these enums match Gateway's actual supported values

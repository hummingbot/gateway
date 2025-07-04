import { z } from 'zod';

// Chain parameter schemas
export const ParamChain = z
  .enum([
    'ethereum',
    'polygon',
    'arbitrum',
    'avalanche',
    'optimism',
    'base',
    'bsc',
    'celo',
    'worldchain',
    'solana',
  ])
  .describe('The blockchain network to use');

export const ParamNetwork = z
  .enum(['mainnet', 'sepolia', 'devnet'])
  .describe(
    'The specific network for the chain (e.g., mainnet, sepolia for Ethereum, or mainnet, devnet for Solana)',
  );

export const ParamConnector = z
  .enum(['uniswap', 'jupiter', 'meteora', 'raydium'])
  .describe('The DEX connector to use for trading operations');

// Address schemas
export const ParamAddress = z
  .string()
  .trim()
  .describe(
    'A wallet address (Ethereum format: 0x... or Solana format: base58)',
  );

export const ParamTokenAddress = z
  .string()
  .trim()
  .describe(
    'The contract address of a token (0x... for EVM chains, base58 for Solana)',
  );

// Token schemas
export const ParamTokenSymbol = z
  .string()
  .trim()
  .toUpperCase()
  .describe('The symbol of a token (e.g., ETH, USDC, SOL)');

export const ParamAmount = z
  .string()
  .trim()
  .describe('The amount of tokens (as a string to preserve precision)');

// Swap parameters
export const ParamSlippage = z
  .number()
  .min(0)
  .max(100)
  .optional()
  .describe('Maximum acceptable slippage percentage (0-100). Defaults to 1%');

export const ParamMaxFeePerGas = z
  .string()
  .optional()
  .describe('Maximum fee per gas in wei (EVM chains only)');

export const ParamMaxPriorityFeePerGas = z
  .string()
  .optional()
  .describe('Maximum priority fee per gas in wei (EVM chains only)');

export const ParamNonce = z
  .number()
  .int()
  .optional()
  .describe('Transaction nonce (EVM chains only)');

// Configuration schemas
export const ParamConfigPath = z
  .string()
  .trim()
  .describe('Path to a configuration file (e.g., ethereum.yml, uniswap.yml)');

export const ParamConfigKey = z
  .string()
  .trim()
  .describe(
    'The configuration key to update (dot notation supported, e.g., "server.port")',
  );

export const ParamConfigValue = z
  .any()
  .describe('The new value for the configuration key');

// Transaction schemas
export const ParamTxHash = z
  .string()
  .trim()
  .describe('Transaction hash to query');

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

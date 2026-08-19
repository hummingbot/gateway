import { Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { MeteoraConfig } from './meteora.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.01;
const CLMM_POOL_ADDRESS_EXAMPLE = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

// Meteora CLMM-specific extensions
export const MeteoraClmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Meteora DLMM pool address (optional - can be looked up from baseToken and quoteToken)',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'The other token in the pair (optional - required if poolAddress not provided)',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    description: 'Trade direction',
    enum: ['BUY', 'SELL'],
    default: 'SELL',
    examples: ['SELL'],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
});

export const MeteoraClmmExecuteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will execute the swap',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Meteora DLMM pool address (optional - can be looked up from baseToken and quoteToken)',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'Quote token symbol or address (optional - required if poolAddress not provided)',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    description: 'Trade direction',
    enum: ['BUY', 'SELL'],
    default: 'SELL',
    examples: ['SELL'],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
});

// Meteora CLMM Get Positions Owned Request
export const MeteoraClmmGetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  walletAddress: Type.String({
    description: 'Solana wallet address to check for positions',
    examples: [solanaChainConfig.defaultWallet],
  }),
});

// ========================================
// DAMM v2 (AMM) Request Schemas
// ========================================

export const MeteoraAmmGetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  walletAddress: Type.String({
    description: 'Solana wallet address to list DAMM v2 positions for',
    examples: [solanaChainConfig.defaultWallet],
  }),
});

import { Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { RaydiumConfig } from './raydium.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.01;
const CLMM_POOL_ADDRESS_EXAMPLE = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';

// ========================================
// AMM Request Schemas
// ========================================

// ========================================
// CLMM Request Schemas
// ========================================

export const RaydiumClmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Raydium CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  binCount: Type.Optional(
    Type.Integer({
      description:
        'If > 0, include a `bins` array (per-tickSpacing token amounts around the current tick), ' +
        'mirroring Meteora pool-info.bins[]. Default 0 — pool-info skips the extra tick-array fetch.',
      default: 0,
      minimum: 0,
      maximum: 401,
    }),
  ),
});
export const RaydiumClmmExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'CLMM pool address (optional)',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'Quote token symbol or address',
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
      default: RaydiumConfig.config.slippagePct,
      examples: [RaydiumConfig.config.slippagePct],
    }),
  ),
});

// ========================================
// CLMM Liquidity Request Schemas
// ========================================

export const RaydiumClmmGetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  walletAddress: Type.String({
    description: 'Solana wallet address to check for positions',
    examples: [solanaChainConfig.defaultWallet],
  }),
});

import { Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import * as AMMBase from '../../schemas/amm-schema';
import * as CLMMBase from '../../schemas/clmm-schema';
import * as Base from '../../schemas/router-schema';

import { RaydiumConfig } from './raydium.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.1;

// Raydium Router-specific extensions for quote-swap
export const RaydiumQuoteSwapRequest = Type.Intersect([
  Type.Omit(Base.QuoteSwapRequest, ['network']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...RaydiumConfig.networks],
        examples: [...RaydiumConfig.networks],
      }),
    ),
    poolAddress: Type.Optional(Type.String()),
  }),
]);

// Raydium Router-specific extensions for quote-swap response
export const RaydiumQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    priceImpactPct: Type.Number(),
    poolAddress: Type.String(),
    fee: Type.Number(),
    computeUnits: Type.Number(),
    activeBinId: Type.Number(),
  }),
]);

// Raydium AMM-specific extensions
export const RaydiumAmmQuoteSwapRequest = Type.Intersect([
  Type.Omit(AMMBase.QuoteSwapRequest, ['network', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...RaydiumConfig.networks],
        examples: [...RaydiumConfig.networks],
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
        default: RaydiumConfig.config.slippagePct,
        examples: [RaydiumConfig.config.slippagePct],
      }),
    ),
  }),
]);

export const RaydiumAmmExecuteSwapRequest = Type.Intersect([
  Type.Omit(AMMBase.ExecuteSwapRequest, ['network', 'walletAddress', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...RaydiumConfig.networks],
        examples: [...RaydiumConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will execute the swap',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
        default: RaydiumConfig.config.slippagePct,
        examples: [RaydiumConfig.config.slippagePct],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

// Raydium CLMM-specific extensions
export const RaydiumClmmQuoteSwapRequest = Type.Intersect([
  Type.Omit(CLMMBase.QuoteSwapRequest, ['network', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...RaydiumConfig.networks],
        examples: [...RaydiumConfig.networks],
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
        default: RaydiumConfig.config.slippagePct,
        examples: [RaydiumConfig.config.slippagePct],
      }),
    ),
  }),
]);

export const RaydiumClmmExecuteSwapRequest = Type.Intersect([
  Type.Omit(CLMMBase.ExecuteSwapRequest, ['network', 'walletAddress', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...RaydiumConfig.networks],
        examples: [...RaydiumConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will execute the swap',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
        default: RaydiumConfig.config.slippagePct,
        examples: [RaydiumConfig.config.slippagePct],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

// Raydium AMM Add Liquidity Request
export const RaydiumAmmAddLiquidityRequest = Type.Intersect([
  Type.Omit(AMMBase.AddLiquidityRequest, ['network', 'walletAddress', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...RaydiumConfig.networks],
        examples: [...RaydiumConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will add liquidity',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
        default: RaydiumConfig.config.slippagePct,
        examples: [RaydiumConfig.config.slippagePct],
      }),
    ),
  }),
]);

// Raydium AMM Remove Liquidity Request
export const RaydiumAmmRemoveLiquidityRequest = Type.Intersect([
  Type.Omit(AMMBase.RemoveLiquidityRequest, ['network', 'walletAddress']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...RaydiumConfig.networks],
        examples: [...RaydiumConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will remove liquidity',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
  }),
]);

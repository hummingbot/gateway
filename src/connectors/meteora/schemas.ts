import { StrategyType } from '@meteora-ag/dlmm';
import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import * as CLMMBase from '../../schemas/clmm-schema';
import * as Base from '../../schemas/router-schema';

import { MeteoraConfig } from './meteora.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.1;

// Meteora Router-specific extensions for quote-swap
export const MeteoraQuoteSwapRequest = Type.Intersect([
  Type.Omit(Base.QuoteSwapRequest, ['network']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
      }),
    ),
    poolAddress: Type.Optional(Type.String()),
  }),
]);

// Meteora Router-specific extensions for quote-swap response
export const MeteoraQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    priceImpactPct: Type.Number(),
    poolAddress: Type.String(),
    fee: Type.Number(),
    gasEstimate: Type.String(),
    computeUnits: Type.Number(),
  }),
]);

// Meteora CLMM-specific extensions
export const MeteoraClmmQuoteSwapRequest = Type.Intersect([
  Type.Omit(CLMMBase.QuoteSwapRequest, ['network', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
        default: MeteoraConfig.config.slippagePct,
        examples: [MeteoraConfig.config.slippagePct],
      }),
    ),
  }),
]);

export const MeteoraClmmExecuteSwapRequest = Type.Intersect([
  Type.Omit(CLMMBase.ExecuteSwapRequest, ['network', 'walletAddress', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
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
        default: MeteoraConfig.config.slippagePct,
        examples: [MeteoraConfig.config.slippagePct],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

// Meteora CLMM Open Position Request
export const MeteoraClmmOpenPositionRequest = Type.Intersect([
  Type.Omit(CLMMBase.OpenPositionRequest, ['network', 'walletAddress', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will open the position',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
        default: MeteoraConfig.config.slippagePct,
        examples: [MeteoraConfig.config.slippagePct],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
    strategyType: Type.Optional(
      Type.Number({
        description: 'Strategy type for the position',
        examples: [StrategyType.SpotImBalanced],
        enum: Object.values(StrategyType).filter((x) => typeof x === 'number'),
      }),
    ),
  }),
]);

// Meteora CLMM Add Liquidity Request
export const MeteoraClmmAddLiquidityRequest = Type.Intersect([
  Type.Omit(CLMMBase.AddLiquidityRequest, ['network', 'walletAddress', 'slippagePct']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
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
        default: MeteoraConfig.config.slippagePct,
        examples: [MeteoraConfig.config.slippagePct],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
    strategyType: Type.Optional(
      Type.Number({
        description: 'Strategy type for the position',
        examples: [StrategyType.SpotImBalanced],
        enum: Object.values(StrategyType).filter((x) => typeof x === 'number'),
      }),
    ),
  }),
]);

// Meteora CLMM Remove Liquidity Request
export const MeteoraClmmRemoveLiquidityRequest = Type.Intersect([
  Type.Omit(CLMMBase.RemoveLiquidityRequest, ['network', 'walletAddress']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will remove liquidity',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

// Meteora CLMM Close Position Request
export const MeteoraClmmClosePositionRequest = Type.Intersect([
  Type.Omit(CLMMBase.ClosePositionRequest, ['network', 'walletAddress']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will close the position',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

// Meteora CLMM Collect Fees Request
export const MeteoraClmmCollectFeesRequest = Type.Intersect([
  Type.Omit(CLMMBase.CollectFeesRequest, ['network', 'walletAddress']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
        examples: [...MeteoraConfig.networks],
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will collect fees',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

import { Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { RaydiumConfig } from './raydium.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.1;
const AMM_POOL_ADDRESS_EXAMPLE = '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj';
const CLMM_POOL_ADDRESS_EXAMPLE = '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv';

// ========================================
// AMM Request Schemas
// ========================================

export const RaydiumAmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Raydium AMM pool address',
    examples: [AMM_POOL_ADDRESS_EXAMPLE],
  }),
});

export const RaydiumAmmGetPositionInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Raydium AMM pool address',
    examples: [AMM_POOL_ADDRESS_EXAMPLE],
  }),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
});

export const RaydiumAmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'AMM pool address (optional - can be looked up from baseToken and quoteToken)',
      examples: [AMM_POOL_ADDRESS_EXAMPLE],
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
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
});

export const RaydiumAmmExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will execute the swap',
      default: solanaChainConfig.defaultWallet,
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
      description: 'AMM pool address (optional - can be looked up from baseToken and quoteToken)',
      examples: [AMM_POOL_ADDRESS_EXAMPLE],
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
    enum: ['BUY', 'SELL'],
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
  // Raydium-specific fee parameters for execution
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

export const RaydiumAmmQuoteLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Raydium AMM pool address',
    examples: [AMM_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
    examples: [1.0],
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
    examples: [100.0],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
});

export const RaydiumAmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Raydium AMM pool address',
    examples: [AMM_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
    examples: [1.0],
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
    examples: [100.0],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
  // Raydium-specific fee parameters
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

export const RaydiumAmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Raydium AMM pool address',
    examples: [AMM_POOL_ADDRESS_EXAMPLE],
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
    examples: [50],
  }),
  // Raydium-specific fee parameters
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

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
});

export const RaydiumClmmGetPositionInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'],
  }),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
});

export const RaydiumClmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'CLMM pool address (optional - can be looked up from tokens)',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'The other token in the pair',
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
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
});

export const RaydiumClmmExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
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
    enum: ['BUY', 'SELL'],
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
  // Raydium-specific fee parameters
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

// ========================================
// CLMM Liquidity Request Schemas
// ========================================

export const RaydiumClmmOpenPositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  lowerPrice: Type.Number({
    description: 'Lower price bound for the position',
    examples: [90],
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
    examples: [110],
  }),
  poolAddress: Type.String({
    description: 'Raydium CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of base token to deposit',
      examples: [1.0],
    }),
  ),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of quote token to deposit',
      examples: [100.0],
    }),
  ),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
  // Raydium-specific fee parameters
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

export const RaydiumClmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'],
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
    examples: [1.0],
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
    examples: [100.0],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: RaydiumConfig.config.slippagePct,
    }),
  ),
  // Raydium-specific fee parameters
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

export const RaydiumClmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address to remove liquidity from',
    examples: ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'],
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
    examples: [50],
  }),
  // Raydium-specific fee parameters
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

export const RaydiumClmmClosePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address to close',
    examples: ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'],
  }),
  // Raydium-specific fee parameters
  priorityFeePerCU: Type.Optional(
    Type.Number({
      description: 'Priority fee per compute unit in lamports',
      examples: [1000],
    }),
  ),
  computeUnits: Type.Optional(
    Type.Number({
      description: 'Max compute units for transaction',
      examples: [300000],
    }),
  ),
});

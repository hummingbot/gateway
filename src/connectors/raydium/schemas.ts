import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { RaydiumConfig } from './raydium.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.01;
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;
const LOWER_PRICE_BOUND = 100;
const UPPER_PRICE_BOUND = 300;
const AMM_POOL_ADDRESS_EXAMPLE = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
const CLMM_POOL_ADDRESS_EXAMPLE = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';

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
      examples: [RaydiumConfig.config.slippagePct],
    }),
  ),
});

// Export the type for ExecuteSwapRequest
export type RaydiumClmmExecuteSwapRequestType = Static<typeof RaydiumClmmExecuteSwapRequest>;

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
    examples: [BASE_TOKEN_AMOUNT],
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
    examples: [QUOTE_TOKEN_AMOUNT],
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
    examples: [BASE_TOKEN_AMOUNT],
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
    examples: [QUOTE_TOKEN_AMOUNT],
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
    examples: [100],
  }),
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
    examples: ['<sample-position-address>'],
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
      examples: [RaydiumConfig.config.slippagePct],
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
    examples: [LOWER_PRICE_BOUND],
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
    examples: [UPPER_PRICE_BOUND],
  }),
  poolAddress: Type.String({
    description: 'Raydium CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of base token to deposit',
      examples: [BASE_TOKEN_AMOUNT],
    }),
  ),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of quote token to deposit',
      examples: [QUOTE_TOKEN_AMOUNT],
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
    examples: ['<sample-position-address>'],
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
    examples: [BASE_TOKEN_AMOUNT],
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
    examples: [QUOTE_TOKEN_AMOUNT],
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
    examples: [100],
  }),
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
});

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

export type RaydiumClmmGetPositionsOwnedRequestType = Static<typeof RaydiumClmmGetPositionsOwnedRequest>;

export const RaydiumClmmQuotePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...RaydiumConfig.networks],
    }),
  ),
  lowerPrice: Type.Number({
    description: 'Lower price bound for the position',
    examples: [LOWER_PRICE_BOUND],
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
    examples: [UPPER_PRICE_BOUND],
  }),
  poolAddress: Type.String({
    description: 'Raydium CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of base token to deposit',
      examples: [BASE_TOKEN_AMOUNT],
    }),
  ),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of quote token to deposit',
      examples: [QUOTE_TOKEN_AMOUNT],
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
});

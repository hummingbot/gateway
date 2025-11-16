import { Static, Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { PancakeswapSolConfig } from './pancakeswap-sol.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.01;
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;
const LOWER_PRICE_BOUND = 150;
const UPPER_PRICE_BOUND = 250;
const CLMM_POOL_ADDRESS_EXAMPLE = '4QU2NpRaqmKMvPSwVKQDeW4V6JFEKJdkzbzdauumD9qN';
const POSITION_ADDRESS_EXAMPLE = '';

// CLMM Pool Info Request
export const PancakeswapSolClmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'PancakeSwap CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
});

export type PancakeswapSolClmmGetPoolInfoRequestType = Static<typeof PancakeswapSolClmmGetPoolInfoRequest>;

// CLMM Open Position Request
export const PancakeswapSolClmmOpenPositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'PancakeSwap CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  lowerPrice: Type.Number({
    description: 'Lower price bound for the position',
    examples: [LOWER_PRICE_BOUND],
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
    examples: [UPPER_PRICE_BOUND],
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
      default: PancakeswapSolConfig.config.slippagePct,
      examples: [PancakeswapSolConfig.config.slippagePct],
    }),
  ),
});

export type PancakeswapSolClmmOpenPositionRequestType = Static<typeof PancakeswapSolClmmOpenPositionRequest>;

// CLMM Position Info Request
export const PancakeswapSolClmmGetPositionInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: [POSITION_ADDRESS_EXAMPLE],
  }),
});

export type PancakeswapSolClmmGetPositionInfoRequestType = Static<typeof PancakeswapSolClmmGetPositionInfoRequest>;

// CLMM Get Positions Owned Request
export const PancakeswapSolClmmGetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
    }),
  ),
  walletAddress: Type.String({
    description: 'Solana wallet address to check for positions',
    examples: [solanaChainConfig.defaultWallet],
  }),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Optional pool address to filter positions by specific pool',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
});

export type PancakeswapSolClmmGetPositionsOwnedRequestType = Static<typeof PancakeswapSolClmmGetPositionsOwnedRequest>;

// CLMM Quote Swap Request
export const PancakeswapSolClmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'CLMM pool address (optional - can be looked up from tokens)',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'Quote token symbol or address',
    examples: [QUOTE_TOKEN],
  }),
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
      default: PancakeswapSolConfig.config.slippagePct,
      examples: [PancakeswapSolConfig.config.slippagePct],
    }),
  ),
});

export type PancakeswapSolClmmQuoteSwapRequestType = Static<typeof PancakeswapSolClmmQuoteSwapRequest>;

// CLMM Execute Swap Request
export const PancakeswapSolClmmExecuteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
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
  quoteToken: Type.String({
    description: 'Quote token symbol or address',
    examples: [QUOTE_TOKEN],
  }),
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
      default: PancakeswapSolConfig.config.slippagePct,
      examples: [PancakeswapSolConfig.config.slippagePct],
    }),
  ),
});

export type PancakeswapSolClmmExecuteSwapRequestType = Static<typeof PancakeswapSolClmmExecuteSwapRequest>;

// CLMM Close Position Request
export const PancakeswapSolClmmClosePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
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
    examples: [POSITION_ADDRESS_EXAMPLE],
  }),
});

export type PancakeswapSolClmmClosePositionRequestType = Static<typeof PancakeswapSolClmmClosePositionRequest>;

// CLMM Remove Liquidity Request
export const PancakeswapSolClmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
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
    examples: [POSITION_ADDRESS_EXAMPLE],
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
    examples: [100],
  }),
});

export type PancakeswapSolClmmRemoveLiquidityRequestType = Static<typeof PancakeswapSolClmmRemoveLiquidityRequest>;

// CLMM Collect Fees Request
export const PancakeswapSolClmmCollectFeesRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
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
    examples: [POSITION_ADDRESS_EXAMPLE],
  }),
});

export type PancakeswapSolClmmCollectFeesRequestType = Static<typeof PancakeswapSolClmmCollectFeesRequest>;

// CLMM Add Liquidity Request
export const PancakeswapSolClmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
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
    examples: [POSITION_ADDRESS_EXAMPLE],
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
      default: PancakeswapSolConfig.config.slippagePct,
      examples: [PancakeswapSolConfig.config.slippagePct],
    }),
  ),
});

export type PancakeswapSolClmmAddLiquidityRequestType = Static<typeof PancakeswapSolClmmAddLiquidityRequest>;

// CLMM Quote Position Request
export const PancakeswapSolClmmQuotePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...PancakeswapSolConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'PancakeSwap CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  lowerPrice: Type.Number({
    description: 'Lower price bound for the position',
    examples: [LOWER_PRICE_BOUND],
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
    examples: [UPPER_PRICE_BOUND],
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
      default: PancakeswapSolConfig.config.slippagePct,
      examples: [PancakeswapSolConfig.config.slippagePct],
    }),
  ),
});

export type PancakeswapSolClmmQuotePositionRequestType = Static<typeof PancakeswapSolClmmQuotePositionRequest>;

import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { PoolInfoSchema } from '../../schemas/clmm-schema';

import { OrcaConfig } from './orca.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.01;
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;
const LOWER_PRICE_BOUND = 200;
const UPPER_PRICE_BOUND = 300;
const CLMM_POOL_ADDRESS_EXAMPLE = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

// Orca-specific extension
export const OrcaPoolInfoSchema = Type.Composite(
  [
    PoolInfoSchema,
    Type.Object({
      liquidity: Type.String(),
      sqrtPrice: Type.String(),
      tvlUsdc: Type.Number(),
      protocolFeeRate: Type.Number(),
      yieldOverTvl: Type.Number(),
    }),
  ],
  { $id: 'OrcaPoolInfo' },
);
export type OrcaPoolInfo = Static<typeof OrcaPoolInfoSchema>;

// Orca-specific extensions for quote-swap
export const OrcaQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
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
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
  poolAddress: Type.Optional(Type.String()),
});

// Orca-specific extensions for quote-swap response
export const OrcaQuoteSwapResponse = Type.Object({
  baseTokenAmount: Type.Number(),
  quoteTokenAmount: Type.Number(),
  exchangeRate: Type.Number(),
  priceImpactPct: Type.Number(),
  poolAddress: Type.String(),
  fee: Type.Number(),
  gasEstimate: Type.String(),
  computeUnits: Type.Number(),
});

// Orca CLMM-specific extensions
export const OrcaClmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Orca CLMM pool address (optional - can be looked up from baseToken and quoteToken)',
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
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
});

// Export the type for QuoteSwapRequest
export type OrcaClmmQuoteSwapRequestType = Static<typeof OrcaClmmQuoteSwapRequest>;

export const OrcaClmmExecuteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
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
      description: 'Orca CLMM pool address (optional - can be looked up from baseToken and quoteToken)',
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
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
});

// Export the type for ExecuteSwapRequest
export type OrcaClmmExecuteSwapRequestType = Static<typeof OrcaClmmExecuteSwapRequest>;

// Orca CLMM Open Position Request
export const OrcaClmmOpenPositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will open the position',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
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
    description: 'Orca CLMM pool address',
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
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
});

// Orca CLMM Add Liquidity Request
export const OrcaClmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will add liquidity',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: ['<sample-position-address>'],
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
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
});

// Orca CLMM Remove Liquidity Request
export const OrcaClmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will remove liquidity',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: ['<sample-position-address>'],
  }),
  liquidityPct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Percentage of liquidity to remove',
      default: 100,
      examples: [100],
    }),
  ),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: 1,
      examples: [1],
    }),
  ),
});

// Orca CLMM Close Position Request
export const OrcaClmmClosePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will close the position',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: ['<sample-position-address>'],
  }),
});

// Orca CLMM Collect Fees Request
export const OrcaClmmCollectFeesRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will collect fees',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: ['<sample-position-address>'],
  }),
});

// Orca CLMM Fetch Pools Request
export const OrcaClmmFetchPoolsRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      default: 10,
      description: 'Maximum number of pools to return',
      examples: [10],
    }),
  ),
  tokenA: Type.Optional(
    Type.String({
      description: 'First token symbol or address',
      examples: [BASE_TOKEN],
    }),
  ),
  tokenB: Type.Optional(
    Type.String({
      description: 'Second token symbol or address',
      examples: [QUOTE_TOKEN],
    }),
  ),
});

// Orca CLMM Get Pool Info Request
export const OrcaClmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Orca CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
});

// Orca CLMM Get Position Info Request
export const OrcaClmmGetPositionInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position address',
    examples: ['<sample-position-address>'],
  }),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
});

// Orca CLMM Get Positions Owned Request
export const OrcaClmmGetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address to check for positions',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  poolAddress: Type.String({
    description: 'Orca CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
});

// Orca CLMM Quote Position Request
export const OrcaClmmQuotePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
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
    description: 'Orca CLMM pool address',
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
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
});

// Orca position data structure (from @orca-so/whirlpools)
const OrcaPositionDataSchema = Type.Object({
  discriminator: Type.Any(), // Uint8Array(8)
  whirlpool: Type.String(),
  positionMint: Type.String(),
  liquidity: Type.Any(), // bigint
  tickLowerIndex: Type.Number(),
  tickUpperIndex: Type.Number(),
  feeGrowthCheckpointA: Type.Any(), // bigint
  feeOwedA: Type.Any(), // bigint
  feeGrowthCheckpointB: Type.Any(), // bigint
  feeOwedB: Type.Any(), // bigint
  rewardInfos: Type.Array(Type.Any()), // Array of reward info objects
});

const OrcaPositionSchema = Type.Object({
  executable: Type.Boolean(),
  lamports: Type.Any(), // bigint
  programAddress: Type.String(),
  space: Type.Any(), // bigint
  address: Type.String(),
  data: OrcaPositionDataSchema,
  exists: Type.Boolean(),
  tokenProgram: Type.String(),
  isPositionBundle: Type.Boolean(),
});

export type OrcaPosition = Static<typeof OrcaPositionSchema>;

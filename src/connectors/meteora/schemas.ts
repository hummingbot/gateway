import { StrategyType } from '@meteora-ag/dlmm';
import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { MeteoraConfig } from './meteora.config';

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
const CLMM_POOL_ADDRESS_EXAMPLE = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

// Meteora Router-specific extensions for quote-swap
export const MeteoraQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
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
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
  poolAddress: Type.Optional(Type.String()),
});

// Meteora Router-specific extensions for quote-swap response
export const MeteoraQuoteSwapResponse = Type.Object({
  baseTokenAmount: Type.Number(),
  quoteTokenAmount: Type.Number(),
  exchangeRate: Type.Number(),
  priceImpactPct: Type.Number(),
  poolAddress: Type.String(),
  fee: Type.Number(),
  gasEstimate: Type.String(),
  computeUnits: Type.Number(),
});

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

// Export the type for QuoteSwapRequest
export type MeteoraClmmQuoteSwapRequestType = Static<typeof MeteoraClmmQuoteSwapRequest>;

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

// Export the type for ExecuteSwapRequest
export type MeteoraClmmExecuteSwapRequestType = Static<typeof MeteoraClmmExecuteSwapRequest>;

// Meteora CLMM Open Position Request
export const MeteoraClmmOpenPositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
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
    description: 'Meteora DLMM pool address',
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
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
  strategyType: Type.Optional(
    Type.Number({
      description: 'Strategy type for the position',
      examples: [StrategyType.Spot],
      enum: Object.values(StrategyType).filter((x) => typeof x === 'number'),
    }),
  ),
});

// Meteora CLMM Add Liquidity Request
export const MeteoraClmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
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
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
  strategyType: Type.Optional(
    Type.Number({
      description: 'Strategy type for the position',
      examples: [StrategyType.Spot],
      enum: Object.values(StrategyType).filter((x) => typeof x === 'number'),
    }),
  ),
});

// Meteora CLMM Remove Liquidity Request
export const MeteoraClmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
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
  percentageToRemove: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Percentage of liquidity to remove',
      default: 100,
      examples: [100],
    }),
  ),
});

// Meteora CLMM Close Position Request
export const MeteoraClmmClosePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
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

// Meteora CLMM Collect Fees Request
export const MeteoraClmmCollectFeesRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
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

// Meteora CLMM Fetch Pools Request
export const MeteoraClmmFetchPoolsRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  page: Type.Optional(
    Type.Number({
      minimum: 0,
      default: 0,
      description: 'Page number (0-based)',
      examples: [0],
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 1000,
      default: 50,
      description: 'Maximum number of pools to return (max 1000)',
      examples: [50],
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: 'Search query to match pools by name, tokens, or address',
      examples: ['SOL', 'USDC', 'SOL-USDC'],
    }),
  ),
  sortBy: Type.Optional(
    Type.String({
      description: 'Sort by field (volume, fees, tvl, apr) with optional time window',
      default: 'volume_24h:desc',
      examples: ['volume_24h:desc', 'tvl:desc', 'apr:desc'],
    }),
  ),
  includeUnverified: Type.Optional(
    Type.Boolean({
      description: 'Include pools with unverified tokens',
      default: true,
    }),
  ),
});

// Meteora CLMM Get Pool Info Request
export const MeteoraClmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
});

// Meteora CLMM Get Position Info Request
export const MeteoraClmmGetPositionInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  positionAddress: Type.String({
    description: 'Position NFT address',
    examples: ['<sample-position-address>'],
  }),
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

export type MeteoraClmmGetPositionsOwnedRequestType = Static<typeof MeteoraClmmGetPositionsOwnedRequest>;

// Meteora CLMM Quote Position Request
export const MeteoraClmmQuotePositionRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
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
    description: 'Meteora DLMM pool address',
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
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
  strategyType: Type.Optional(
    Type.Number({
      description: 'Strategy type for the position',
      examples: [StrategyType.Spot],
      enum: Object.values(StrategyType).filter((x) => typeof x === 'number'),
    }),
  ),
});

// Meteora CLMM Create Pool Request
export const MeteoraClmmCreatePoolRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will create the pool',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
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
  initialPrice: Type.Number({
    description: 'Initial price as quote per base (e.g. USDC per SOL). Encodes the pool active bin.',
    examples: [UPPER_PRICE_BOUND],
  }),
  binStep: Type.Number({
    description:
      'Bin step in basis points (e.g. 1, 2, 4, 5, 10, 20, 25, 50, 100). Sets pool granularity; ' +
      'cannot be changed after creation.',
    examples: [20],
  }),
  feeBps: Type.Number({
    description: 'Base swap fee in basis points (e.g. 20 = 0.20%). Must be compatible with binStep.',
    examples: [20],
  }),
});

// ========================================
// DAMM v2 (AMM) Request Schemas
// ========================================

const DAMM_V2_POOL_ADDRESS_EXAMPLE = 'FH6mP2MUobhDnLERp9z5yv5t2zMUA9WDNXPixpbvYKMv';

export const MeteoraAmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DAMM v2 pool address',
    examples: [DAMM_V2_POOL_ADDRESS_EXAMPLE],
  }),
});

export const MeteoraAmmGetPositionInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DAMM v2 pool address',
    examples: [DAMM_V2_POOL_ADDRESS_EXAMPLE],
  }),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
});

export const MeteoraAmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DAMM v2 pool address',
    examples: [DAMM_V2_POOL_ADDRESS_EXAMPLE],
  }),
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'The other token in the pair (optional - resolved from the pool if omitted)',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap (denominated in the base token)',
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
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
});

export const MeteoraAmmExecuteSwapRequest = Type.Object({
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
      enum: [...MeteoraConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DAMM v2 pool address',
    examples: [DAMM_V2_POOL_ADDRESS_EXAMPLE],
  }),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'The other token in the pair (optional - resolved from the pool if omitted)',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap (denominated in the base token)',
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
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
});

export const MeteoraAmmQuoteLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DAMM v2 pool address',
    examples: [DAMM_V2_POOL_ADDRESS_EXAMPLE],
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
      default: MeteoraConfig.config.slippagePct,
      examples: [MeteoraConfig.config.slippagePct],
    }),
  ),
});

export const MeteoraAmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DAMM v2 pool address',
    examples: [DAMM_V2_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
    examples: [BASE_TOKEN_AMOUNT],
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
    examples: [QUOTE_TOKEN_AMOUNT],
  }),
  positionAddress: Type.Optional(
    Type.String({
      description:
        'DAMM v2 positions are NFTs; a wallet may hold several per pool. Provide a position address ' +
        '(from position-info) to add to that specific position; omit to open a NEW position NFT.',
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
});

export const MeteoraAmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Meteora DAMM v2 pool address',
    examples: [DAMM_V2_POOL_ADDRESS_EXAMPLE],
  }),
  positionAddress: Type.String({
    description:
      'Address of the specific DAMM v2 position (NFT) to remove from. Required — a wallet may hold ' +
      'several positions per pool; list them with position-info. This avoids silently draining only ' +
      'the largest position when several exist.',
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of this position’s liquidity to remove',
    examples: [100],
  }),
});

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
export type MeteoraAmmGetPositionsOwnedRequestType = Static<typeof MeteoraAmmGetPositionsOwnedRequest>;

export const MeteoraAmmCreatePoolRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...MeteoraConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will create and seed the pool',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address (becomes pool token A)',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'Quote token symbol or address (becomes pool token B)',
    examples: [QUOTE_TOKEN],
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to seed the pool with',
    examples: [BASE_TOKEN_AMOUNT],
  }),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description:
        'Amount of quote token to seed with. If provided, the base:quote ratio sets the initial price. ' +
        'If omitted (and no initialPrice), the current market price is fetched from the swap router.',
      examples: [QUOTE_TOKEN_AMOUNT],
    }),
  ),
  initialPrice: Type.Optional(
    Type.Number({
      description:
        'Initial price as quote per base (e.g. SOL per UMBRA). Overrides quoteTokenAmount. ' +
        'If both are omitted, the pool is seeded at the current market price so it is not immediately arbitraged.',
    }),
  ),
  configAddress: Type.Optional(
    Type.String({
      description:
        'DAMM v2 config account that defines the fee tier and pool parameters. Required — many permissionless ' +
        'configs are launch configs with very high starting fees, so Gateway does not auto-select one.',
    }),
  ),
});

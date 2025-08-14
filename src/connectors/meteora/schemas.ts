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
const SWAP_AMOUNT = 0.01;
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;
const LOWER_PRICE_BOUND = 100;
const UPPER_PRICE_BOUND = 300;
const CLMM_POOL_ADDRESS_EXAMPLE = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6';

// Meteora Router-specific extensions for quote-swap
export const MeteoraQuoteSwapRequest = Type.Intersect([
  Type.Omit(Base.QuoteSwapRequest, ['network']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
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
export const MeteoraClmmOpenPositionRequest = Type.Intersect([
  Type.Omit(CLMMBase.OpenPositionRequest, ['network', 'walletAddress', 'slippagePct']),
  Type.Object({
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

// Meteora CLMM Close Position Request
export const MeteoraClmmClosePositionRequest = Type.Intersect([
  Type.Omit(CLMMBase.ClosePositionRequest, ['network', 'walletAddress']),
  Type.Object({
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
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address that will collect fees',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
  }),
]);

// Meteora CLMM Fetch Pools Request
export const MeteoraClmmFetchPoolsRequest = Type.Intersect([
  Type.Omit(CLMMBase.FetchPoolsRequest, ['network']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
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
  }),
]);

// Meteora CLMM Get Pool Info Request
export const MeteoraClmmGetPoolInfoRequest = Type.Intersect([
  Type.Omit(CLMMBase.GetPoolInfoRequest, ['network']),
  Type.Object({
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
  }),
]);

// Meteora CLMM Get Position Info Request
export const MeteoraClmmGetPositionInfoRequest = Type.Intersect([
  Type.Omit(CLMMBase.GetPositionInfoRequest, ['network', 'walletAddress']),
  Type.Object({
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
    walletAddress: Type.Optional(
      Type.String({
        description: 'Solana wallet address',
        default: solanaChainConfig.defaultWallet,
        examples: [solanaChainConfig.defaultWallet],
      }),
    ),
  }),
]);

// Meteora CLMM Get Positions Owned Request
export const MeteoraClmmGetPositionsOwnedRequest = Type.Intersect([
  Type.Omit(CLMMBase.GetPositionsOwnedRequest, ['network', 'walletAddress', 'poolAddress']),
  Type.Object({
    network: Type.Optional(
      Type.String({
        description: 'Solana network to use',
        default: solanaChainConfig.defaultNetwork,
        enum: [...MeteoraConfig.networks],
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
      description: 'Meteora DLMM pool address',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  }),
]);

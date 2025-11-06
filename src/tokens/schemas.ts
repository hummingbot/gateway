import { Type } from '@sinclair/typebox';

// Individual token structure
export const TokenSchema = Type.Object({
  name: Type.String({
    description: 'The full name of the token',
    examples: ['USD Coin', 'Wrapped Ether'],
  }),
  symbol: Type.String({
    description: 'The token symbol',
    examples: ['USDC', 'WETH'],
  }),
  address: Type.String({
    description: 'The token contract address',
    examples: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
  }),
  decimals: Type.Number({
    description: 'The number of decimals the token uses',
    minimum: 0,
    maximum: 255,
    examples: [6, 18],
  }),
});

export type Token = typeof TokenSchema.static;

// Query parameters for listing tokens
export const TokenListQuerySchema = Type.Object({
  chain: Type.Optional(
    Type.String({
      description: 'Blockchain network (e.g., ethereum, solana)',
      examples: ['ethereum', 'solana'],
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'Network name (e.g., mainnet, mainnet-beta)',
      examples: ['mainnet', 'mainnet-beta', 'devnet'],
    }),
  ),
  search: Type.Optional(
    Type.String({
      description: 'Search term for filtering tokens by symbol or name',
      examples: ['USDC', 'USD'],
    }),
  ),
});

export type TokenListQuery = typeof TokenListQuerySchema.static;

// Query parameters for viewing a specific token
export const TokenViewQuerySchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain network (e.g., ethereum, solana)',
    examples: ['ethereum', 'solana'],
  }),
  network: Type.String({
    description: 'Network name (e.g., mainnet, mainnet-beta)',
    examples: ['mainnet', 'mainnet-beta', 'devnet'],
  }),
});

export type TokenViewQuery = typeof TokenViewQuerySchema.static;

// Request body for adding a token
export const TokenAddRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain network (e.g., ethereum, solana)',
    examples: ['ethereum', 'solana'],
  }),
  network: Type.String({
    description: 'Network name (e.g., mainnet, mainnet-beta)',
    examples: ['mainnet', 'mainnet-beta', 'devnet'],
  }),
  token: TokenSchema,
});

export type TokenAddRequest = typeof TokenAddRequestSchema.static;

// Query parameters for removing a token
export const TokenRemoveQuerySchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain network (e.g., ethereum, solana)',
    examples: ['ethereum', 'solana'],
  }),
  network: Type.String({
    description: 'Network name (e.g., mainnet, mainnet-beta)',
    examples: ['mainnet', 'mainnet-beta', 'devnet'],
  }),
});

export type TokenRemoveQuery = typeof TokenRemoveQuerySchema.static;

// Response format for token lists
export const TokenListResponseSchema = Type.Object({
  tokens: Type.Array(TokenSchema),
});

export type TokenListResponse = typeof TokenListResponseSchema.static;

// Response format for single token
export const TokenResponseSchema = Type.Object({
  token: TokenSchema,
  chain: Type.String(),
  network: Type.String(),
});

export type TokenResponse = typeof TokenResponseSchema.static;

// Success response format
export const TokenOperationResponseSchema = Type.Object({
  message: Type.String({
    description: 'Success message',
  }),
  requiresRestart: Type.Boolean({
    description: 'Whether gateway restart is required',
    default: true,
  }),
});

export type TokenOperationResponse = typeof TokenOperationResponseSchema.static;

// Top pool info from CoinGecko/GeckoTerminal
export const TopPoolInfoSchema = Type.Object({
  poolAddress: Type.String({
    description: 'Pool contract address',
  }),
  dex: Type.String({
    description: 'DEX identifier (e.g., orca, raydium-clmm, uniswap-v3)',
  }),
  baseTokenAddress: Type.String({
    description: 'Base token contract address',
  }),
  quoteTokenAddress: Type.String({
    description: 'Quote token contract address',
  }),
  baseTokenSymbol: Type.String({
    description: 'Base token symbol',
  }),
  quoteTokenSymbol: Type.String({
    description: 'Quote token symbol',
  }),
  priceUsd: Type.String({
    description: 'Token price in USD',
  }),
  priceNative: Type.String({
    description: 'Token price in quote token',
  }),
  volumeUsd24h: Type.String({
    description: '24-hour trading volume in USD',
  }),
  priceChange24h: Type.String({
    description: '24-hour price change percentage',
  }),
  liquidityUsd: Type.String({
    description: 'Total liquidity in USD',
  }),
  txns24h: Type.Object({
    buys: Type.Number({ description: 'Number of buy transactions in 24h' }),
    sells: Type.Number({ description: 'Number of sell transactions in 24h' }),
  }),
});

export type TopPoolInfo = typeof TopPoolInfoSchema.static;

// Query parameters for top pools
export const TopPoolsQuerySchema = Type.Object({
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    examples: ['solana-mainnet-beta', 'ethereum-mainnet', 'bsc-mainnet'],
  }),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of pools to return',
      minimum: 1,
      maximum: 30,
      default: 10,
    }),
  ),
});

export type TopPoolsQuery = typeof TopPoolsQuerySchema.static;

// Response format for top pools
export const TopPoolsResponseSchema = Type.Object({
  pools: Type.Array(TopPoolInfoSchema),
  chainNetwork: Type.String(),
  tokenAddress: Type.String(),
});

export type TopPoolsResponse = typeof TopPoolsResponseSchema.static;

// Token info from GeckoTerminal
export const TokenInfoSchema = Type.Object({
  address: Type.String({
    description: 'Token contract address',
  }),
  name: Type.String({
    description: 'Token name',
  }),
  symbol: Type.String({
    description: 'Token symbol',
  }),
  decimals: Type.Number({
    description: 'Token decimals',
  }),
  imageUrl: Type.String({
    description: 'Token image URL',
  }),
  coingeckoCoinId: Type.Union([Type.String(), Type.Null()], {
    description: 'CoinGecko coin ID if available',
  }),
  websites: Type.Array(Type.String(), {
    description: 'Token website URLs',
  }),
  description: Type.String({
    description: 'Token description',
  }),
  gtScore: Type.Number({
    description: 'GeckoTerminal score (0-100)',
  }),
  holders: Type.Optional(
    Type.Object({
      count: Type.Number({
        description: 'Number of token holders',
      }),
      topTenPercent: Type.Optional(
        Type.String({
          description: 'Percentage held by top 10 holders',
        }),
      ),
    }),
  ),
});

export type TokenInfo = typeof TokenInfoSchema.static;

// Query parameters for finding token
export const FindTokenQuerySchema = Type.Object({
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    examples: ['solana-mainnet-beta', 'ethereum-mainnet', 'bsc-mainnet'],
  }),
});

export type FindTokenQuery = typeof FindTokenQuerySchema.static;

// Response format for finding token
export const FindTokenResponseSchema = Type.Object({
  tokenInfo: TokenInfoSchema,
  chainNetwork: Type.String(),
});

export type FindTokenResponse = typeof FindTokenResponseSchema.static;

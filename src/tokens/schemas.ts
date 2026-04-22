import { Type } from '@sinclair/typebox';

import { ConfigManagerV2 } from '../services/config-manager-v2';

// Optional CoinGecko data for tokens
export const TokenGeckoDataSchema = Type.Object({
  coingeckoCoinId: Type.Union([Type.String(), Type.Null()], {
    description: 'CoinGecko coin ID if available',
  }),
  imageUrl: Type.String({
    description: 'Token image URL',
  }),
  priceUsd: Type.String({
    description: 'Current price in USD',
  }),
  volumeUsd24h: Type.String({
    description: '24h trading volume in USD',
  }),
  marketCapUsd: Type.String({
    description: 'Market capitalization in USD',
  }),
  fdvUsd: Type.String({
    description: 'Fully diluted valuation in USD',
  }),
  totalSupply: Type.String({
    description: 'Normalized total supply (human-readable)',
  }),
  topPools: Type.Array(Type.String(), {
    description: 'Array of top pool addresses',
  }),
  timestamp: Type.Number({
    description: 'Unix timestamp (ms) when data was fetched',
  }),
});

export type TokenGeckoData = typeof TokenGeckoDataSchema.static;

// Individual token structure
export const TokenSchema = Type.Object({
  chainId: Type.Optional(
    Type.Number({
      description: 'The chain ID',
      examples: [1, 101, 137],
    }),
  ),
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
  geckoData: Type.Optional(TokenGeckoDataSchema),
});

export type Token = {
  chainId?: number;
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  geckoData?: TokenGeckoData;
};

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
});

export type TokenOperationResponse = typeof TokenOperationResponseSchema.static;

// Token info with optional CoinGecko data (returned by /tokens/find)
export const TokenInfoSchema = Type.Composite([
  TokenSchema,
  Type.Object({
    geckoData: Type.Optional(TokenGeckoDataSchema),
  }),
]);

export type TokenInfo = typeof TokenInfoSchema.static;

// Query parameters for finding token
export const FindTokenQuerySchema = Type.Object({
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    examples: ['solana-mainnet-beta', 'ethereum-mainnet', 'ethereum-base', 'ethereum-polygon'],
  }),
});

export type FindTokenQuery = typeof FindTokenQuerySchema.static;

// Response format for finding token (returns TokenSchema format ready to save)
export const FindTokenResponseSchema = TokenSchema;

export type FindTokenResponse = typeof FindTokenResponseSchema.static;

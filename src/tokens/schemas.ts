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
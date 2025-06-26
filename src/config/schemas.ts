import { Type, Static } from '@sinclair/typebox';

// Configuration update schema
export const ConfigUpdateRequestSchema = Type.Object({
  configPath: Type.String({ description: 'Configuration path' }),
  configValue: Type.Union(
    [
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Object({}),
      Type.Array(Type.Any()),
    ],
    { description: 'Configuration value' },
  ),
});

export const ConfigUpdateResponseSchema = Type.Object({
  message: Type.String({ description: 'Status message' }),
});

// TypeScript types for config update
export type ConfigUpdateRequest = Static<typeof ConfigUpdateRequestSchema>;
export type ConfigUpdateResponse = Static<typeof ConfigUpdateResponseSchema>;

// Default pools schemas
export const DefaultPoolRequestSchema = Type.Object({
  connector: Type.String({
    description:
      'Connector name in format "connector/type" (e.g., raydium/amm, raydium/clmm, uniswap/amm, uniswap/clmm, meteora/clmm)',
    examples: [
      'raydium/amm',
      'raydium/clmm',
      'uniswap/amm',
      'uniswap/clmm',
      'meteora/clmm',
      'minswap/amm',
      'sundaeswap/amm',
    ],
  }),
  baseToken: Type.String({
    description: 'Base token symbol',
    examples: ['SOL', 'USDC', 'ETH', 'WETH', 'ADA'],
  }),
  quoteToken: Type.String({
    description: 'Quote token symbol',
    examples: ['USDC', 'USDT', 'DAI', 'WETH', 'MIN', 'SUNDAE'],
  }),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Pool address (required for adding, optional for removal)',
      examples: [
        '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv', // Solana example (raydium/meteora)
        '0xd0b53d9277642d899df5c87a3966a349a798f224', // Ethereum example (uniswap)
      ],
    }),
  ),
});

export const DefaultPoolResponseSchema = Type.Object({
  message: Type.String({ description: 'Status message' }),
});

export type DefaultPoolRequest = Static<typeof DefaultPoolRequestSchema>;
export type DefaultPoolResponse = Static<typeof DefaultPoolResponseSchema>;

// Default pool list schema
export const DefaultPoolListSchema = Type.Record(
  Type.String({
    pattern: '^[A-Z]+-[A-Z]+$',
  }),
  Type.String(),
);

export type DefaultPoolListResponse = Static<typeof DefaultPoolListSchema>;

// Config query schema
export const ConfigQuerySchema = Type.Object({
  chainOrConnector: Type.Optional(
    Type.String({
      description:
        'Optional chain or connector name (e.g., "solana", "ethereum", "uniswap")',
      examples: ['solana'],
    }),
  ),
});

export type ConfigQuery = Static<typeof ConfigQuerySchema>;

// Pools query schema
export const PoolsQuerySchema = Type.Object({
  connector: Type.String({
    description:
      'Connector name in format "connector/type" (e.g., raydium/amm, raydium/clmm, uniswap/amm, uniswap/clmm, meteora/clmm)',
    examples: [
      'raydium/amm',
      'raydium/clmm',
      'uniswap/amm',
      'uniswap/clmm',
      'meteora/clmm',
      'minswap/amm',
      'sundaeswap/amm',
    ],
  }),
});

export type PoolsQuery = Static<typeof PoolsQuerySchema>;

import { Type } from '@sinclair/typebox';

import { ConfigManagerV2 } from '../services/config-manager-v2';

// Pool list request
export const PoolListRequestSchema = Type.Object({
  connector: Type.String({
    description: 'Connector (raydium, meteora, uniswap)',
    examples: ['raydium', 'meteora', 'uniswap'],
  }),
  network: Type.Optional(
    Type.String({
      description: 'Optional: filter by network (mainnet, mainnet-beta, etc)',
      examples: ['mainnet', 'mainnet-beta', 'base'],
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: 'Optional: filter by pool type',
      examples: ['clmm', 'amm'],
      enum: ['clmm', 'amm'],
    }),
  ),
  search: Type.Optional(
    Type.String({
      description: 'Optional: search by token symbol or address',
    }),
  ),
});

// Pool template (core data stored in templates)
export const PoolTemplateSchema = Type.Object({
  type: Type.String({
    description: 'Pool type',
    examples: ['clmm', 'amm'],
    enum: ['clmm', 'amm'],
  }),
  network: Type.String(),
  baseSymbol: Type.String(),
  quoteSymbol: Type.String(),
  baseTokenAddress: Type.String(),
  quoteTokenAddress: Type.String(),
  feePct: Type.Number(),
  address: Type.String(),
});

export type PoolTemplate = typeof PoolTemplateSchema.static;

// Pool list response (includes template data, no geckoData)
export const PoolListResponseSchema = Type.Array(PoolTemplateSchema);

// Add pool request
export const PoolAddRequestSchema = Type.Object({
  connector: Type.String({
    description: 'Connector (raydium, meteora, uniswap)',
    examples: ['raydium', 'meteora', 'uniswap'],
  }),
  type: Type.String({
    description: 'Pool type',
    examples: ['clmm', 'amm'],
    enum: ['clmm', 'amm'],
  }),
  network: Type.String({
    description: 'Network name (mainnet, mainnet-beta, etc)',
    examples: ['mainnet-beta', 'mainnet'],
    default: 'mainnet-beta',
  }),
  address: Type.String({
    description: 'Pool contract address',
  }),
  baseSymbol: Type.String({
    description: 'Base token symbol',
    examples: ['SOL', 'ETH'],
  }),
  quoteSymbol: Type.String({
    description: 'Quote token symbol',
    examples: ['USDC', 'USDT'],
  }),
  baseTokenAddress: Type.String({
    description: 'Base token contract address',
    examples: ['So11111111111111111111111111111111111111112'],
  }),
  quoteTokenAddress: Type.String({
    description: 'Quote token contract address',
    examples: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
  }),
  feePct: Type.Optional(
    Type.Number({
      description: 'Pool fee percentage (optional - fetched from pool-info if not provided)',
      examples: [0.25, 0.3, 1],
      minimum: 0,
      maximum: 100,
    }),
  ),
});

// Get pool request
export const GetPoolRequestSchema = Type.Object({
  connector: Type.String({
    description: 'Connector (raydium, meteora, uniswap)',
    examples: ['raydium', 'meteora', 'uniswap'],
  }),
  network: Type.String({
    description: 'Network name (mainnet, mainnet-beta, etc)',
    examples: ['mainnet-beta', 'mainnet'],
    default: 'mainnet-beta',
  }),
  type: Type.String({
    description: 'Pool type',
    examples: ['amm', 'clmm'],
    enum: ['amm', 'clmm'],
  }),
});

// Success response
export const PoolSuccessResponseSchema = Type.Object({
  message: Type.String(),
});

// Optional CoinGecko data for pools
export const PoolGeckoDataSchema = Type.Object({
  volumeUsd24h: Type.String({
    description: '24-hour trading volume in USD',
  }),
  liquidityUsd: Type.String({
    description: 'Total liquidity in USD',
  }),
  priceNative: Type.String({
    description: 'Base token price in quote token',
  }),
  priceUsd: Type.String({
    description: 'Base token price in USD',
  }),
  buys24h: Type.Number({
    description: 'Number of buy transactions in 24h',
  }),
  sells24h: Type.Number({
    description: 'Number of sell transactions in 24h',
  }),
  apr: Type.Optional(
    Type.Number({
      description: 'Annual percentage rate',
    }),
  ),
  timestamp: Type.Number({
    description: 'Unix timestamp (ms) when data was fetched',
  }),
});

export type PoolGeckoData = typeof PoolGeckoDataSchema.static;

// Pool info with optional CoinGecko data (returned by /pools/find)
export const PoolInfoSchema = Type.Composite([
  PoolTemplateSchema,
  Type.Object({
    geckoData: Type.Optional(PoolGeckoDataSchema),
  }),
]);

export type PoolInfo = typeof PoolInfoSchema.static;

// Find pools query parameters
export const FindPoolsQuerySchema = Type.Object({
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    examples: ['solana-mainnet-beta', 'ethereum-mainnet', 'ethereum-base', 'ethereum-polygon'],
  }),
  connector: Type.Optional(
    Type.String({
      description: 'Filter by connector name (e.g., raydium, meteora, uniswap, pancakeswap, pancakeswap-sol)',
      examples: ['raydium', 'meteora', 'uniswap', 'pancakeswap', 'pancakeswap-sol'],
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: 'Filter by pool type: clmm (v3-style concentrated liquidity) or amm (v2-style)',
      examples: ['clmm', 'amm'],
      enum: ['clmm', 'amm'],
      default: 'clmm',
    }),
  ),
  tokenA: Type.Optional(
    Type.String({
      description: 'First token symbol or contract address (optional - for filtering by token pair)',
      examples: ['SOL', 'So11111111111111111111111111111111111111112', 'USDC'],
    }),
  ),
  tokenB: Type.Optional(
    Type.String({
      description: 'Second token symbol or contract address (optional - for filtering by token pair)',
      examples: ['USDC', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'SOL'],
    }),
  ),
  pages: Type.Optional(
    Type.Number({
      description: 'Number of pages to fetch from GeckoTerminal (1-10, default: 10)',
      minimum: 1,
      maximum: 10,
      default: 10,
    }),
  ),
});

export type FindPoolsQuery = typeof FindPoolsQuerySchema.static;

// Find pools response
export const FindPoolsResponseSchema = Type.Array(PoolInfoSchema);

export type FindPoolsResponse = typeof FindPoolsResponseSchema.static;

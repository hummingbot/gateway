import { Type } from '@sinclair/typebox';

import { CHAIN_NETWORK_EXAMPLES } from '../services/chain-utils';

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

// Pool list response
export const PoolListResponseSchema = Type.Array(
  Type.Object({
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
  }),
);

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
  baseSymbol: Type.Optional(
    Type.String({
      description: 'Base token symbol (optional - fetched from pool-info if not provided)',
      examples: ['SOL', 'ETH'],
    }),
  ),
  quoteSymbol: Type.Optional(
    Type.String({
      description: 'Quote token symbol (optional - fetched from pool-info if not provided)',
      examples: ['USDC', 'USDT'],
    }),
  ),
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

// Pool info from GeckoTerminal (reusing token schema structure)
export const PoolInfoSchema = Type.Object({
  poolAddress: Type.String({
    description: 'Pool contract address',
  }),
  dex: Type.String({
    description: 'DEX identifier (e.g., raydium, raydium-clmm, uniswap-v3)',
  }),
  connector: Type.Union([Type.String(), Type.Null()], {
    description: 'Gateway connector name (e.g., raydium, meteora, uniswap)',
  }),
  type: Type.Union([Type.String({ enum: ['clmm', 'amm'] }), Type.Null()], {
    description: 'Pool type: AMM (v2-style) or CLMM (v3-style concentrated liquidity)',
    examples: ['clmm', 'amm'],
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

export type PoolInfo = typeof PoolInfoSchema.static;

// Find pools query parameters
export const FindPoolsQuerySchema = Type.Object({
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    examples: [...CHAIN_NETWORK_EXAMPLES],
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
  page: Type.Optional(
    Type.Number({
      description: 'Number of pages to fetch from GeckoTerminal (1-10, default: 3)',
      minimum: 1,
      maximum: 10,
      default: 3,
    }),
  ),
});

export type FindPoolsQuery = typeof FindPoolsQuerySchema.static;

// Find pools response
export const FindPoolsResponseSchema = Type.Array(PoolInfoSchema);

export type FindPoolsResponse = typeof FindPoolsResponseSchema.static;

// Find and save pools query parameters (extends FindPoolsQuery with saveLimit)
export const FindSavePoolsQuerySchema = Type.Object({
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    examples: [...CHAIN_NETWORK_EXAMPLES],
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
  page: Type.Optional(
    Type.Number({
      description: 'Number of pages to fetch from GeckoTerminal (1-10, default: 3)',
      minimum: 1,
      maximum: 10,
      default: 3,
    }),
  ),
  saveLimit: Type.Optional(
    Type.Number({
      description: 'Maximum number of pools to save (default: 1)',
      minimum: 1,
      default: 1,
    }),
  ),
});

export type FindSavePoolsQuery = typeof FindSavePoolsQuerySchema.static;

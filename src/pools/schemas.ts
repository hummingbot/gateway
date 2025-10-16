import { Type } from '@sinclair/typebox';

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
    Type.Union([Type.Literal('amm'), Type.Literal('clmm')], {
      description: 'Optional: filter by pool type',
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
    type: Type.Union([Type.Literal('amm'), Type.Literal('clmm')]),
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
  type: Type.Union([Type.Literal('amm'), Type.Literal('clmm')], {
    description: 'Pool type',
  }),
  network: Type.String({
    description: 'Network name (mainnet, mainnet-beta, etc)',
    examples: ['mainnet', 'mainnet-beta'],
  }),
  address: Type.String({
    description: 'Pool contract address',
  }),
  baseSymbol: Type.Optional(
    Type.String({
      description: 'Base token symbol (optional - fetched from pool-info if not provided)',
      examples: ['ETH', 'SOL'],
    }),
  ),
  quoteSymbol: Type.Optional(
    Type.String({
      description: 'Quote token symbol (optional - fetched from pool-info if not provided)',
      examples: ['USDC', 'USDT'],
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

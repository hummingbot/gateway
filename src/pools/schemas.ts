import { Type } from '@sinclair/typebox';

// Pool list request
export const PoolListRequestSchema = Type.Object({
  connector: Type.String({
    description: 'Connector (raydium, meteora, uniswap, orca)',
    examples: ['raydium', 'meteora', 'uniswap', 'orca'],
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
      examples: ['amm', 'clmm'],
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
    address: Type.String(),
  }),
);

// Add pool request
export const PoolAddRequestSchema = Type.Object({
  connector: Type.String({
    description: 'Connector (raydium, meteora, uniswap, orca)',
    examples: ['raydium', 'meteora', 'uniswap', 'orca'],
  }),
  type: Type.Union([Type.Literal('amm'), Type.Literal('clmm')], {
    description: 'Pool type',
  }),
  network: Type.String({
    description: 'Network name (mainnet, mainnet-beta, etc)',
    examples: ['mainnet', 'mainnet-beta'],
  }),
  baseSymbol: Type.String({
    description: 'Base token symbol',
    examples: ['ETH', 'SOL'],
  }),
  quoteSymbol: Type.String({
    description: 'Quote token symbol',
    examples: ['USDC', 'USDT'],
  }),
  address: Type.String({
    description: 'Pool contract address',
  }),
});

// Success response
export const PoolSuccessResponseSchema = Type.Object({
  message: Type.String(),
});

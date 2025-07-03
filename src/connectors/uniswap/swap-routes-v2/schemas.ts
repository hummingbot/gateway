import { Type } from '@sinclair/typebox';

import * as Base from '../../../schemas/swap-schema';

// Uniswap-specific request extensions
export const UniswapGetPriceRequest = Type.Intersect([
  Base.GetPriceRequest,
  Type.Object({
    // Uniswap-specific options
    protocols: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Protocols to use (v2, v3, mixed)',
        examples: [['v2', 'v3']],
      }),
    ),
  }),
]);

export const UniswapGetQuoteRequest = Type.Intersect([
  Base.GetQuoteRequest,
  Type.Object({
    walletAddress: Type.String({
      description: 'Wallet address for the swap',
    }),
    protocols: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Protocols to use (v2, v3, mixed)',
        examples: [['v2', 'v3']],
      }),
    ),
    enableUniversalRouter: Type.Optional(
      Type.Boolean({
        description: 'Use Universal Router for the swap',
        default: true,
      }),
    ),
  }),
]);

export const UniswapExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    protocols: Type.Optional(Type.Array(Type.String())),
    enableUniversalRouter: Type.Optional(
      Type.Boolean({
        default: true,
      }),
    ),
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
  }),
]);

export const UniswapExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
  }),
]);

// Response extensions
export const UniswapGetPriceResponse = Type.Intersect([
  Base.GetPriceResponse,
  Type.Object({
    route: Type.Array(Type.String(), {
      description: 'Token symbols in the routing path',
    }),
    routePath: Type.String({
      description: 'Detailed routing path through pools',
    }),
    protocols: Type.Array(Type.String(), {
      description: 'Protocols used in the route',
    }),
  }),
]);

export const UniswapGetQuoteResponse = Type.Intersect([
  Base.GetQuoteResponse,
  Type.Object({
    route: Type.Array(Type.String()),
    routePath: Type.String(),
    protocols: Type.Array(Type.String()),
    methodParameters: Type.Object({
      calldata: Type.String(),
      value: Type.String(),
      to: Type.String(),
    }),
    gasPriceWei: Type.String(),
    gasEstimate: Type.String(),
  }),
]);

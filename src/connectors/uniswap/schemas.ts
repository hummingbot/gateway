import { Type } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

// Uniswap-specific extensions for quote-swap
export const UniswapQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    walletAddress: Type.Optional(Type.String()),
    protocols: Type.Optional(Type.Array(Type.String())),
    exactIn: Type.Optional(Type.Boolean()),
  }),
]);

// Uniswap-specific extensions for quote-swap response
export const UniswapQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    priceImpactPct: Type.Number({
      description: 'Estimated price impact as a percentage (0-100)',
    }),
    expirationTime: Type.Number(),
    gasEstimate: Type.String(),
    route: Type.Optional(Type.Array(Type.String())),
    routePath: Type.Optional(Type.String()),
    protocols: Type.Optional(Type.Array(Type.String())),
    methodParameters: Type.Optional(Type.Any()),
    gasPriceWei: Type.Optional(Type.String()),
  }),
]);

// Uniswap-specific extensions for execute-quote
export const UniswapExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
  }),
]);

// Uniswap-specific extensions for execute-swap
export const UniswapExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    protocols: Type.Optional(Type.Array(Type.String())),
    exactIn: Type.Optional(Type.Boolean()),
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
  }),
]);

import { Type } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

// 0x-specific extensions for get-price
export const ZeroXGetPriceRequest = Type.Intersect([
  Base.GetPriceRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    excludedSources: Type.Optional(Type.Array(Type.String())),
    includedSources: Type.Optional(Type.Array(Type.String())),
  }),
]);

// 0x-specific extensions for get-price response
export const ZeroXGetPriceResponse = Type.Intersect([
  Base.GetPriceResponse,
  Type.Object({
    priceImpactPct: Type.Number(),
  }),
]);

// 0x-specific extensions for quote-swap
export const ZeroXQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    excludedSources: Type.Optional(Type.Array(Type.String())),
    includedSources: Type.Optional(Type.Array(Type.String())),
    skipValidation: Type.Optional(Type.Boolean()),
    takerAddress: Type.Optional(Type.String()),
  }),
]);

// 0x-specific extensions for quote-swap response
export const ZeroXQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    priceImpactPct: Type.Number(),
    expirationTime: Type.Number(),
    gasEstimate: Type.String(),
    sources: Type.Optional(Type.Array(Type.Any())),
    allowanceTarget: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
    data: Type.Optional(Type.String()),
    value: Type.Optional(Type.String()),
  }),
]);

// 0x-specific extensions for execute-quote
export const ZeroXExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
  }),
]);

// 0x-specific extensions for execute-swap
export const ZeroXExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
    excludedSources: Type.Optional(Type.Array(Type.String())),
    includedSources: Type.Optional(Type.Array(Type.String())),
  }),
]);

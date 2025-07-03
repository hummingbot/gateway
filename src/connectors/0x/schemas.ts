import { Type } from '@sinclair/typebox';

import * as Base from '../../schemas/swap-schema';

// 0x-specific extensions for get-price
export const ZeroXGetPriceRequest = Type.Intersect([
  Base.GetPriceRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    excludedSources: Type.Optional(Type.Array(Type.String())),
    includedSources: Type.Optional(Type.Array(Type.String())),
  }),
]);

// 0x-specific extensions for get-quote
export const ZeroXGetQuoteRequest = Type.Intersect([
  Base.GetQuoteRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    excludedSources: Type.Optional(Type.Array(Type.String())),
    includedSources: Type.Optional(Type.Array(Type.String())),
    skipValidation: Type.Optional(Type.Boolean()),
    takerAddress: Type.Optional(Type.String()),
  }),
]);

// 0x-specific extensions for get-quote response
export const ZeroXGetQuoteResponse = Type.Intersect([
  Base.GetQuoteResponse,
  Type.Object({
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

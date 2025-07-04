import { Type } from '@sinclair/typebox';

import {
  GetPriceRequest,
  QuoteSwapRequest,
  ExecuteQuoteRequest,
  ExecuteSwapRequest,
  GetPriceResponse,
  QuoteSwapResponse,
} from '../../../schemas/router-schema';

// 0x-specific extensions
export const ZeroXGetPriceRequest = Type.Intersect([
  GetPriceRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String({ description: 'Gas price in wei' })),
    excludedSources: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Sources to exclude from routing',
      }),
    ),
    includedSources: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Sources to include in routing',
      }),
    ),
  }),
]);

export const ZeroXQuoteSwapRequest = Type.Intersect([
  QuoteSwapRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String({ description: 'Gas price in wei' })),
    excludedSources: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Sources to exclude from routing',
      }),
    ),
    includedSources: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Sources to include in routing',
      }),
    ),
    skipValidation: Type.Optional(
      Type.Boolean({ description: 'Skip validation for faster quote' }),
    ),
    takerAddress: Type.Optional(
      Type.String({ description: 'Address that will execute the swap' }),
    ),
  }),
]);

export const ZeroXExecuteQuoteRequest = Type.Intersect([
  ExecuteQuoteRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String({ description: 'Gas price in wei' })),
    maxGas: Type.Optional(Type.Number({ description: 'Maximum gas limit' })),
  }),
]);

export const ZeroXExecuteSwapRequest = Type.Intersect([
  ExecuteSwapRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String({ description: 'Gas price in wei' })),
    maxGas: Type.Optional(Type.Number({ description: 'Maximum gas limit' })),
    excludedSources: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Sources to exclude from routing',
      }),
    ),
    includedSources: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Sources to include in routing',
      }),
    ),
  }),
]);

export const ZeroXGetPriceResponse = GetPriceResponse;
export const ZeroXQuoteSwapResponse = QuoteSwapResponse;

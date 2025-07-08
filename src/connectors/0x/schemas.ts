import { Type, Static } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

// GetPrice schemas - only used by 0x connector
export const GetPriceRequest = Type.Object(
  {
    network: Type.String(),
    baseToken: Type.String({
      description: 'Token to determine swap direction',
    }),
    quoteToken: Type.String({
      description: 'The other token in the pair',
    }),
    amount: Type.Number(),
    side: Type.Enum(
      { BUY: 'BUY', SELL: 'SELL' },
      {
        description: 'Trade direction',
      },
    ),
  },
  { $id: 'GetPriceRequest' },
);
export type GetPriceRequestType = Static<typeof GetPriceRequest>;

export const GetPriceResponse = Type.Object(
  {
    estimatedAmountIn: Type.Number(),
    estimatedAmountOut: Type.Number(),
    price: Type.Number(),
    // Computed fields for clarity
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    // Price impact percentage (optional for backward compatibility)
    priceImpactPct: Type.Optional(
      Type.Number({
        description: 'Estimated price impact as a percentage (0-100)',
      }),
    ),
  },
  { $id: 'GetPriceResponse' },
);
export type GetPriceResponseType = Static<typeof GetPriceResponse>;

// 0x-specific extensions for get-price
export const ZeroXGetPriceRequest = Type.Intersect([
  GetPriceRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    excludedSources: Type.Optional(Type.Array(Type.String())),
    includedSources: Type.Optional(Type.Array(Type.String())),
  }),
]);

// 0x-specific extensions for get-price response
export const ZeroXGetPriceResponse = Type.Intersect([
  GetPriceResponse,
  Type.Object({
    // priceImpactPct is now included in base schema
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
    priceImpactPct: Type.Number({
      description: 'Estimated price impact as a percentage (0-100)',
    }),
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

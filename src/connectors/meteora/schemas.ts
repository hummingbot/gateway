import { Type } from '@sinclair/typebox';

import * as CLMMBase from '../../schemas/clmm-schema';
import * as Base from '../../schemas/router-schema';

// Meteora Router-specific extensions for quote-swap
export const MeteoraQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    poolAddress: Type.Optional(Type.String()),
  }),
]);

// Meteora Router-specific extensions for quote-swap response
export const MeteoraQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    priceImpactPct: Type.Number(),
    poolAddress: Type.String(),
    fee: Type.Number(),
    gasEstimate: Type.String(),
    computeUnits: Type.Number(),
  }),
]);

// Meteora CLMM-specific extensions
export const MeteoraClmmExecuteSwapRequest = Type.Intersect([
  CLMMBase.ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

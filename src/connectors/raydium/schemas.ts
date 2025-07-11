import { Type } from '@sinclair/typebox';

import * as AMMBase from '../../schemas/amm-schema';
import * as CLMMBase from '../../schemas/clmm-schema';
import * as Base from '../../schemas/router-schema';

// Raydium Router-specific extensions for quote-swap
export const RaydiumQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    poolAddress: Type.Optional(Type.String()),
  }),
]);

// Raydium Router-specific extensions for quote-swap response
export const RaydiumQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    priceImpactPct: Type.Number(),
    poolAddress: Type.String(),
    fee: Type.Number(),
    computeUnits: Type.Number(),
    activeBinId: Type.Number(),
  }),
]);

// Raydium AMM-specific extensions
export const RaydiumAmmQuoteSwapRequest = Type.Intersect([
  AMMBase.QuoteSwapRequest,
  Type.Object({
    // Raydium-specific optional fields can be added here if needed
  }),
]);

export const RaydiumAmmExecuteSwapRequest = Type.Intersect([
  AMMBase.ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

// Raydium CLMM-specific extensions
export const RaydiumClmmQuoteSwapRequest = Type.Intersect([
  CLMMBase.QuoteSwapRequest,
  Type.Object({
    // Raydium-specific optional fields can be added here if needed
  }),
]);

export const RaydiumClmmExecuteSwapRequest = Type.Intersect([
  CLMMBase.ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(Type.Number({ description: 'Priority fee per compute unit' })),
    computeUnits: Type.Optional(Type.Number({ description: 'Compute units for transaction' })),
  }),
]);

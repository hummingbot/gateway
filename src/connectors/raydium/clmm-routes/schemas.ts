import { Type } from '@sinclair/typebox';

import {
  QuoteSwapRequest,
  ExecuteSwapRequest,
} from '../../../schemas/clmm-schema';

// Raydium CLMM-specific extensions
export const RaydiumClmmQuoteSwapRequest = Type.Intersect([
  QuoteSwapRequest,
  Type.Object({
    // Raydium-specific optional fields can be added here if needed
  }),
]);

export const RaydiumClmmExecuteSwapRequest = Type.Intersect([
  ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(
      Type.Number({ description: 'Priority fee per compute unit' }),
    ),
    computeUnits: Type.Optional(
      Type.Number({ description: 'Compute units for transaction' }),
    ),
  }),
]);

import { Type } from '@sinclair/typebox';

import {
  QuoteSwapRequest,
  ExecuteSwapRequest,
} from '../../../schemas/amm-schema';

// Raydium AMM-specific extensions
export const RaydiumAmmQuoteSwapRequest = Type.Intersect([
  QuoteSwapRequest,
  Type.Object({
    // Raydium-specific optional fields can be added here if needed
  }),
]);

export const RaydiumAmmExecuteSwapRequest = Type.Intersect([
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

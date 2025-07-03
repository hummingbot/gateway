import { Type } from '@sinclair/typebox';

import { ExecuteSwapRequest } from '../../../schemas/clmm-schema';

// Meteora CLMM-specific extensions
export const MeteoraClmmExecuteSwapRequest = Type.Intersect([
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

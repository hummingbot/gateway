import { Type } from '@sinclair/typebox';

import { ExecuteSwapRequest } from '../../../schemas/swap-schema';

// Jupiter swap-specific extensions (for old routes)
export const JupiterExecuteSwapRequest = Type.Intersect([
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

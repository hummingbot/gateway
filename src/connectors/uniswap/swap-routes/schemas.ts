import { Type } from '@sinclair/typebox';

import { ExecuteSwapRequest } from '../../../schemas/swap-schema';

// Uniswap swap-specific extensions
export const UniswapExecuteSwapRequest = Type.Intersect([
  ExecuteSwapRequest,
  Type.Object({
    priorityFeePerCU: Type.Optional(
      Type.Number({
        description: 'Priority fee per compute unit (not used on EVM)',
      }),
    ),
    computeUnits: Type.Optional(
      Type.Number({ description: 'Compute units (not used on EVM)' }),
    ),
  }),
]);

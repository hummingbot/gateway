import { Type, Static } from '@sinclair/typebox';

import { PoolInfoSchema } from '../../schemas/clmm-schema';

// Get chain config for defaults

// Constants for examples

// Orca-specific extension
export const OrcaPoolInfoSchema = Type.Composite(
  [
    PoolInfoSchema,
    Type.Object({
      liquidity: Type.String(),
      sqrtPrice: Type.String(),
      // null when Orca's API has no figure for the pool: TVL is an off-chain analytic.
      tvlUsdc: Type.Union([Type.Number(), Type.Null()]),
      protocolFeeRate: Type.Number(),
      yieldOverTvl: Type.Number(),
    }),
  ],
  { $id: 'OrcaPoolInfo' },
);
export type OrcaPoolInfo = Static<typeof OrcaPoolInfoSchema>;

// Orca position data structure (from @orca-so/whirlpools)

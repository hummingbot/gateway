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
      // tvlUsdc and yieldOverTvl are off-chain analytics from Orca's API: null when
      // the API has no figure for the pool.
      tvlUsdc: Type.Union([Type.Number(), Type.Null()]),
      protocolFeeRate: Type.Number(),
      yieldOverTvl: Type.Union([Type.Number(), Type.Null()]),
    }),
  ],
  { $id: 'OrcaPoolInfo' },
);
export type OrcaPoolInfo = Static<typeof OrcaPoolInfoSchema>;

// Orca position data structure (from @orca-so/whirlpools)

import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';
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
      tvlUsdc: Type.Number(),
      protocolFeeRate: Type.Number(),
      yieldOverTvl: Type.Number(),
    }),
  ],
  { $id: 'OrcaPoolInfo' },
);
export type OrcaPoolInfo = Static<typeof OrcaPoolInfoSchema>;

// Orca position data structure (from @orca-so/whirlpools)

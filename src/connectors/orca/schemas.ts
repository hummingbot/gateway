import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { PoolInfoSchema } from '../../schemas/clmm-schema';

import { OrcaConfig } from './orca.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.01;
const CLMM_POOL_ADDRESS_EXAMPLE = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

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

// Orca CLMM-specific extensions
export const OrcaClmmQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Orca CLMM pool address (optional - can be looked up from baseToken and quoteToken)',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'The other token in the pair (optional - required if poolAddress not provided)',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    description: 'Trade direction',
    enum: ['BUY', 'SELL'],
    default: 'SELL',
    examples: ['SELL'],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
});

export const OrcaClmmExecuteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will execute the swap',
      default: solanaChainConfig.defaultWallet,
      examples: [solanaChainConfig.defaultWallet],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Orca CLMM pool address (optional - can be looked up from baseToken and quoteToken)',
      examples: [CLMM_POOL_ADDRESS_EXAMPLE],
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.Optional(
    Type.String({
      description: 'Quote token symbol or address (optional - required if poolAddress not provided)',
      examples: [QUOTE_TOKEN],
    }),
  ),
  amount: Type.Number({
    description: 'Amount to swap',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    description: 'Trade direction',
    enum: ['BUY', 'SELL'],
    default: 'SELL',
    examples: ['SELL'],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: OrcaConfig.config.slippagePct,
      examples: [OrcaConfig.config.slippagePct],
    }),
  ),
});

// Orca CLMM Get Pool Info Request
export const OrcaClmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...OrcaConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Orca CLMM pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  // binCount inherited from base GetPoolInfoRequest semantics — declared
  // explicitly here so the Orca network enum override stays a flat schema.
  binCount: Type.Optional(
    Type.Integer({
      description:
        'If > 0, include a `bins` array (per-tickSpacing token amounts around the current tick). ' +
        'Default 0 — pool-info skips the extra getProgramAccounts call.',
      default: 0,
      minimum: 0,
      maximum: 401,
    }),
  ),
});
// Orca position data structure (from @orca-so/whirlpools)

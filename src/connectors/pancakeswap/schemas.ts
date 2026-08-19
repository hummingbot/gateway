import { Type } from '@sinclair/typebox';

import { PancakeswapConfig } from './pancakeswap.config';

// Get chain config for defaults
// Constants for examples
// Pancakeswap V2 WETH-USDC pool on Base
const CLMM_POOL_ADDRESS_EXAMPLE = '0x172fcd41e0913e95784454622d1c3724f546f849'; // Pancakeswap V3 USDT-WBNB pool on BSC

// ========================================
// AMM Request Schemas
// ========================================

// ========================================
// CLMM Request Schemas
// ========================================

export const PancakeswapClmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: 'bsc',
      examples: ['bsc'],
      enum: [...PancakeswapConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Pancakeswap V3 pool address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  binCount: Type.Optional(
    Type.Integer({
      description:
        'If > 0, include a `bins` array (per-tickSpacing token amounts around the current tick), ' +
        'mirroring Meteora pool-info.bins[]. Default 0 — pool-info skips the extra eth_calls.',
      default: 0,
      minimum: 0,
      maximum: 401,
    }),
  ),
});
// ========================================
// Router Request Schemas
// ========================================

// Pancakeswap-specific quote-swap response
export const PancakeswapQuoteSwapResponse = Type.Object({
  quoteId: Type.String({
    description: 'Unique identifier for this quote',
  }),
  tokenIn: Type.String({
    description: 'Address of the token being swapped from',
  }),
  tokenOut: Type.String({
    description: 'Address of the token being swapped to',
  }),
  amountIn: Type.Number({
    description: 'Amount of tokenIn to be swapped',
  }),
  amountOut: Type.Number({
    description: 'Expected amount of tokenOut to receive',
  }),
  price: Type.Number({
    description: 'Exchange rate between tokenIn and tokenOut',
  }),
  priceImpactPct: Type.Number({
    description: 'Estimated price impact percentage (0-100)',
  }),
  minAmountOut: Type.Number({
    description: 'Minimum amount of tokenOut that will be accepted',
  }),
  maxAmountIn: Type.Number({
    description: 'Maximum amount of tokenIn that will be spent',
  }),
  routePath: Type.Optional(
    Type.String({
      description: 'Human-readable route path',
    }),
  ),
});

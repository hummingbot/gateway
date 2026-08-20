import { Type } from '@sinclair/typebox';

// Get chain config for defaults

// Constants for examples

// DFlow-specific quote-swap response (superset of base QuoteSwapResponse)
export const DFlowQuoteSwapResponse = Type.Object({
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
  approximation: Type.Optional(
    Type.Boolean({
      description:
        'True when a BUY was approximated via a sell-leg ExactIn quote (DFlow is ExactIn-only); amountOut is an estimate',
    }),
  ),
  quoteResponse: Type.Any({
    description: "DFlow's native quote response, used to build the swap transaction at execution time",
  }),
});

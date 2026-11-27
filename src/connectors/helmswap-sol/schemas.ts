import { Type } from '@sinclair/typebox';

export const HelmswapSolQuoteSwapResponse = Type.Object({
  quoteId: Type.String({ description: 'Unique identifier for this quote' }),
  tokenIn: Type.String({ description: 'Address or native symbol of the token being sold' }),
  tokenOut: Type.String({ description: 'Address or native symbol of the token being bought' }),
  amountIn: Type.Number({ description: 'Amount of tokenIn to be swapped' }),
  amountOut: Type.Number({ description: 'Expected amount of tokenOut after the disclosed fee' }),
  price: Type.Number({ description: 'Exchange rate between tokenIn and tokenOut' }),
  priceImpactPct: Type.Number({ description: 'Estimated price impact percentage (0-100)' }),
  minAmountOut: Type.Number({ description: 'Minimum amount of tokenOut that will be accepted' }),
  maxAmountIn: Type.Number({ description: 'Maximum amount of tokenIn that will be spent' }),
  expirationTime: Type.Optional(
    Type.Number({ description: 'Unix timestamp when this quote expires (firm quotes only)' }),
  ),
  feeBps: Type.Optional(Type.Number({ description: 'Disclosed HelmSwap fee in basis points, as returned by the API' })),
});

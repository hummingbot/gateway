import { Type } from '@sinclair/typebox';

// 0x-specific quote-swap response (superset of base QuoteSwapResponse)
export const ZeroXQuoteSwapResponse = Type.Object({
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
  expirationTime: Type.Optional(
    Type.Number({
      description: 'Unix timestamp when this quote expires (only for firm quotes)',
    }),
  ),
  gasEstimate: Type.String({
    description: 'Estimated gas required for the swap',
  }),
  sources: Type.Optional(
    Type.Array(Type.Any(), {
      description: 'Liquidity sources used for this quote',
    }),
  ),
  allowanceTarget: Type.Optional(
    Type.String({
      description: 'Contract address that needs token approval',
    }),
  ),
  to: Type.Optional(
    Type.String({
      description: 'Contract address to send transaction to',
    }),
  ),
  data: Type.Optional(
    Type.String({
      description: 'Encoded transaction data',
    }),
  ),
  value: Type.Optional(
    Type.String({
      description: 'ETH value to send with transaction',
    }),
  ),
});

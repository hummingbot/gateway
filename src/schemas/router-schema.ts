import { Type, Static } from '@sinclair/typebox';

// ========================================
// Base request/response types for DEX aggregators
// and other order router-based connectors
// ========================================

export const QuoteSwapRequest = Type.Object(
  {
    network: Type.String(),
    baseToken: Type.String({
      description: 'Token to determine swap direction',
    }),
    quoteToken: Type.String({
      description: 'The other token in the pair',
    }),
    amount: Type.Number(),
    side: Type.Enum(
      { BUY: 'BUY', SELL: 'SELL' },
      {
        description: 'Trade direction',
      },
    ),
    slippagePct: Type.Number({ minimum: 0, maximum: 100 }),
  },
  { $id: 'QuoteSwapRequest' },
);
export type QuoteSwapRequestType = Static<typeof QuoteSwapRequest>;

export const QuoteSwapResponse = Type.Object(
  {
    quoteId: Type.String(),
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    amountIn: Type.Number(),
    amountOut: Type.Number(),
    price: Type.Number(),
    slippagePct: Type.Number(),
    priceWithSlippage: Type.Number({
      description: 'Price including slippage (worst acceptable price)',
    }),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),
  },
  { $id: 'QuoteSwapResponse' },
);
export type QuoteSwapResponseType = Static<typeof QuoteSwapResponse>;

export const ExecuteQuoteRequest = Type.Object(
  {
    walletAddress: Type.String(),
    network: Type.String(),
    quoteId: Type.String(),
  },
  { $id: 'ExecuteQuoteRequest' },
);
export type ExecuteQuoteRequestType = Static<typeof ExecuteQuoteRequest>;

export const ExecuteSwapRequest = Type.Object(
  {
    walletAddress: Type.String(),
    network: Type.String(),
    baseToken: Type.String(),
    quoteToken: Type.String(),
    amount: Type.Number(),
    side: Type.Enum({ BUY: 'BUY', SELL: 'SELL' }),
    slippagePct: Type.Number({ minimum: 0, maximum: 100 }),
  },
  { $id: 'ExecuteSwapRequest' },
);
export type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;

export const SwapExecuteResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        totalInputSwapped: Type.Number(),
        totalOutputSwapped: Type.Number(),
        fee: Type.Number(),
        baseTokenBalanceChange: Type.Number(),
        quoteTokenBalanceChange: Type.Number(),
        // Computed fields for clarity
        tokenIn: Type.String(),
        tokenOut: Type.String(),
      }),
    ),
  },
  { $id: 'SwapExecuteResponse' },
);
export type SwapExecuteResponseType = Static<typeof SwapExecuteResponse>;

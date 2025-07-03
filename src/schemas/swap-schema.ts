import { Type, Static } from '@sinclair/typebox';

// ========================================
// Base Request/Response Types for Aggregators
// ========================================

// Get-price is only for 0x connector
export const GetPriceRequest = Type.Object(
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
  },
  { $id: 'GetPriceRequest' },
);
export type GetPriceRequestType = Static<typeof GetPriceRequest>;

export const GetPriceResponse = Type.Object(
  {
    estimatedAmountIn: Type.Number(),
    estimatedAmountOut: Type.Number(),
    price: Type.Number(),
    priceImpactPct: Type.Number(),
    // Computed fields for clarity
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    tokenInAmount: Type.Number(),
    tokenOutAmount: Type.Number(),
  },
  { $id: 'GetPriceResponse' },
);
export type GetPriceResponseType = Static<typeof GetPriceResponse>;

// Quote-swap replaces get-quote for all connectors
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
    estimatedAmountIn: Type.Number(),
    estimatedAmountOut: Type.Number(),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),
    price: Type.Number(),
    priceImpactPct: Type.Number(),
    slippagePct: Type.Number(),
    gasEstimate: Type.String(),
    expirationTime: Type.Number(),
    // Computed fields for clarity
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    tokenInAmount: Type.Number(),
    tokenOutAmount: Type.Number(),
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
        tokenInAmount: Type.Number(),
        tokenOutAmount: Type.Number(),
      }),
    ),
  },
  { $id: 'SwapExecuteResponse' },
);
export type SwapExecuteResponseType = Static<typeof SwapExecuteResponse>;

// ========================================
// Legacy Types (for backward compatibility during migration)
// ========================================

export const GetSwapQuoteRequest = Type.Object(
  {
    network: Type.String(),
    poolAddress: Type.Optional(Type.String()),
    baseToken: Type.String({
      description: 'Token to determine swap direction',
    }),
    quoteToken: Type.String({
      description: 'The other token in the pair',
    }),
    amount: Type.Number(),
    side: Type.String({
      enum: ['BUY', 'SELL'],
      description: 'Trade direction',
    }),
    slippagePct: Type.Optional(Type.Number()),
  },
  { $id: 'GetSwapQuoteRequest' },
);
export type GetSwapQuoteRequestType = Static<typeof GetSwapQuoteRequest>;

export const GetSwapQuoteResponse = Type.Object(
  {
    poolAddress: Type.Optional(Type.String()),
    estimatedAmountIn: Type.Number(),
    estimatedAmountOut: Type.Number(),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),
    baseTokenBalanceChange: Type.Number(),
    quoteTokenBalanceChange: Type.Number(),
    price: Type.Number(),
    computeUnits: Type.Number(),
  },
  { $id: 'GetSwapQuoteResponse' },
);
export type GetSwapQuoteResponseType = Static<typeof GetSwapQuoteResponse>;

export const ExecuteSwapRequestLegacy = Type.Object(
  {
    walletAddress: Type.String(),
    network: Type.String(),
    poolAddress: Type.Optional(Type.String()),
    baseToken: Type.String(),
    quoteToken: Type.String(),
    amount: Type.Number(),
    side: Type.String({
      enum: ['BUY', 'SELL'],
      description: 'Trade direction',
    }),
    slippagePct: Type.Optional(Type.Number()),
    priorityFeePerCU: Type.Optional(
      Type.Number({
        description:
          'Priority fee per compute unit (lamports on Solana, Gwei on Ethereum)',
      }),
    ),
    computeUnits: Type.Optional(
      Type.Number({
        description: 'Compute units for transaction',
      }),
    ),
  },
  { $id: 'ExecuteSwapRequestLegacy' },
);
export type ExecuteSwapRequestLegacyType = Static<
  typeof ExecuteSwapRequestLegacy
>;

export const ExecuteSwapResponse = Type.Object({
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
    }),
  ),
});
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

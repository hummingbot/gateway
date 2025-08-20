import { Type, Static } from '@sinclair/typebox';

// ========================================
// Base request/response types for DEX aggregators
// and other order router-based connectors
// ========================================

export const QuoteSwapRequest = Type.Object(
  {
    network: Type.Optional(
      Type.String({
        description: 'The blockchain network to use',
      }),
    ),
    baseToken: Type.String({
      description: 'Token to determine swap direction',
    }),
    quoteToken: Type.String({
      description: 'The other token in the pair',
    }),
    amount: Type.Number({
      description: 'Amount of base token to trade',
    }),
    side: Type.String({
      description:
        'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
      enum: ['BUY', 'SELL'],
    }),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
      }),
    ),
  },
  { $id: 'QuoteSwapRequest' },
);
export type QuoteSwapRequestType = Static<typeof QuoteSwapRequest>;

export const QuoteSwapResponse = Type.Object(
  {
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
  },
  { $id: 'QuoteSwapResponse' },
);
export type QuoteSwapResponseType = Static<typeof QuoteSwapResponse>;

export const ExecuteQuoteRequest = Type.Object(
  {
    walletAddress: Type.Optional(
      Type.String({
        description: 'Wallet address that will execute the swap',
      }),
    ),
    network: Type.Optional(
      Type.String({
        description: 'The blockchain network to use',
      }),
    ),
    quoteId: Type.String({
      description: 'ID of the quote to execute',
    }),
  },
  { $id: 'ExecuteQuoteRequest' },
);
export type ExecuteQuoteRequestType = Static<typeof ExecuteQuoteRequest>;

export const ExecuteSwapRequest = Type.Object(
  {
    walletAddress: Type.Optional(
      Type.String({
        description: 'Wallet address that will execute the swap',
      }),
    ),
    network: Type.Optional(
      Type.String({
        description: 'The blockchain network to use',
      }),
    ),
    baseToken: Type.String({
      description: 'Token to determine swap direction',
    }),
    quoteToken: Type.String({
      description: 'The other token in the pair',
    }),
    amount: Type.Number({
      description: 'Amount of base token to trade',
    }),
    side: Type.String({
      description:
        'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
      enum: ['BUY', 'SELL'],
    }),
    slippagePct: Type.Optional(
      Type.Number({
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
      }),
    ),
  },
  { $id: 'ExecuteSwapRequest' },
);
export type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;

export const SwapExecuteResponse = Type.Object(
  {
    signature: Type.String({
      description: 'Transaction signature/hash',
    }),
    status: Type.Number({
      description: 'Transaction status: 0 = PENDING, 1 = CONFIRMED, -1 = FAILED',
    }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        tokenIn: Type.String({
          description: 'Address of the token swapped from',
        }),
        tokenOut: Type.String({
          description: 'Address of the token swapped to',
        }),
        amountIn: Type.Number({
          description: 'Actual amount of tokenIn swapped',
        }),
        amountOut: Type.Number({
          description: 'Actual amount of tokenOut received',
        }),
        fee: Type.Number({
          description: 'Transaction fee paid',
        }),
        baseTokenBalanceChange: Type.Number({
          description: 'Change in base token balance (negative for decrease)',
        }),
        quoteTokenBalanceChange: Type.Number({
          description: 'Change in quote token balance (negative for decrease)',
        }),
      }),
    ),
  },
  { $id: 'SwapExecuteResponse' },
);
export type SwapExecuteResponseType = Static<typeof SwapExecuteResponse>;

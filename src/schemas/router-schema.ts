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
      format: 'decimal',
      description: 'Amount of base token to trade',
    }),
    side: Type.String({
      description:
        'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
      enum: ['BUY', 'SELL'],
    }),
    slippagePct: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
      }),
    ),
    approximateIfNoExactOut: Type.Optional(
      Type.Boolean({
        description:
          'For BUY orders on routers without ExactOut support: approximate the required input via a sell-leg quote and return an ExactIn quote flagged as an approximation. If false, such BUY requests fail with a clear error.',
        default: true,
      }),
    ),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
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
      format: 'decimal',
      description: 'Amount of tokenIn to be swapped',
    }),
    amountOut: Type.Number({
      format: 'decimal',
      description: 'Expected amount of tokenOut to receive',
    }),
    price: Type.Number({
      format: 'decimal',
      description: 'Exchange rate between tokenIn and tokenOut',
    }),
    priceImpactPct: Type.Number({
      format: 'decimal',
      description: 'Estimated price impact percentage (0-100)',
    }),
    minAmountOut: Type.Number({
      format: 'decimal',
      description: 'Minimum amount of tokenOut that will be accepted',
    }),
    maxAmountIn: Type.Number({
      format: 'decimal',
      description: 'Maximum amount of tokenIn that will be spent',
    }),
    approximation: Type.Optional(
      Type.Boolean({
        description:
          'True when a BUY was approximated via a sell-leg ExactIn quote because the router does not support ExactOut; amountOut is an estimate rather than exact',
      }),
    ),
  },
  // No $id: no route serves this shape. The pool-scoped surfaces answer with the shared
  // Chain* responses, so publishing this would put a name a caller reaches for on a
  // shape they never receive. Kept as the base those responses compose from.
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
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
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
      format: 'decimal',
      description: 'Amount of base token to trade',
    }),
    side: Type.String({
      description:
        'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
      enum: ['BUY', 'SELL'],
    }),
    slippagePct: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        maximum: 100,
        description: 'Maximum acceptable slippage percentage',
      }),
    ),
    approximateIfNoExactOut: Type.Optional(
      Type.Boolean({
        description:
          'For BUY orders on routers without ExactOut support: approximate the required input via a sell-leg quote and execute an ExactIn swap. If false, such BUY requests fail with a clear error.',
        default: true,
      }),
    ),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
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
      Type.Object(
        {
          tokenIn: Type.String({
            description: 'Address of the token swapped from',
          }),
          tokenOut: Type.String({
            description: 'Address of the token swapped to',
          }),
          amountIn: Type.Number({
            format: 'decimal',
            description: 'Actual amount of tokenIn swapped',
          }),
          amountOut: Type.Number({
            format: 'decimal',
            description: 'Actual amount of tokenOut received',
          }),
          fee: Type.Number({
            format: 'decimal',
            description: 'Transaction fee paid',
          }),
          baseTokenBalanceChange: Type.Number({
            format: 'decimal',
            description: 'Change in base token balance (negative for decrease)',
          }),
          quoteTokenBalanceChange: Type.Number({
            format: 'decimal',
            description: 'Change in quote token balance (negative for decrease)',
          }),
          slippagePct: Type.Optional(
            Type.Number({
              format: 'decimal',
              description: 'Slippage tolerance percentage actually applied to the swap',
            }),
          ),
        },
        // No $id: its parent is not published either — nothing would reference this, and a
        // generated client would carry it as a class no response ever produces.
      ),
    ),
  },
  // No $id: no route serves this shape. The pool-scoped surfaces answer with the shared
  // Chain* responses, so publishing this would put a name a caller reaches for on a
  // shape they never receive. Kept as the base those responses compose from.
);
export type SwapExecuteResponseType = Static<typeof SwapExecuteResponse>;

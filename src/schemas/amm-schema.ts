import { Type, Static } from '@sinclair/typebox';

export const PoolInfoSchema = Type.Object(
  {
    address: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    feePct: Type.Number({ format: 'decimal' }),
    price: Type.Number({ format: 'decimal' }),
    baseTokenAmount: Type.Number({ format: 'decimal' }),
    quoteTokenAmount: Type.Number({ format: 'decimal' }),
  },
  { $id: 'AmmPoolInfo' },
);
export type PoolInfo = Static<typeof PoolInfoSchema>;

export const GetPoolInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
);
export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;

export const AddLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    poolAddress: Type.String(),
    baseTokenAmount: Type.Number({ format: 'decimal' }),
    quoteTokenAmount: Type.Number({ format: 'decimal' }),
    slippagePct: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        maximum: 100,
      }),
    ),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
);
export type AddLiquidityRequestType = Static<typeof AddLiquidityRequest>;

export const AddLiquidityResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object(
        {
          fee: Type.Number({ format: 'decimal' }),
          // The venue this write touched. Echoed so a stored record identifies its pool
          // without the request that produced it — the same reason the swap execute
          // responses carry it.
          poolAddress: Type.Optional(Type.String({ description: 'Pool this operation acted on' })),
          // Always the position the write touched — the one just opened when no address was
          // given, or the one named. Without it a caller who just paid to open a DAMM v2
          // position could only recover its address by re-listing positions-owned and
          // diffing, which races any concurrent write and cannot attribute an address to a
          // transaction.
          positionAddress: Type.Optional(
            Type.String({
              description:
                'Position the liquidity went into. Absent on fungible-LP AMMs, which hold liquidity as LP tokens rather than a position account.',
              'x-connectors': ['meteora'],
            } as any),
          ),
          positionRent: Type.Optional(
            Type.Number({
              format: 'decimal',
              description:
                'Native token locked as rent when this call opened the position. Absent when adding to a position that already existed, and on fungible-LP AMMs.',
              'x-connectors': ['meteora'],
            } as any),
          ),
          baseTokenAmountAdded: Type.Number({ format: 'decimal' }),
          quoteTokenAmountAdded: Type.Number({ format: 'decimal' }),
        },
        { $id: 'AmmAddLiquidityResponseData' },
      ),
    ),
  },
  { $id: 'AmmAddLiquidityResponse' },
);
export type AddLiquidityResponseType = Static<typeof AddLiquidityResponse>;

// No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
// the base a unified route composes from. Publishing it would generate a client that
// sends the wrong keys under a name the real wire shape wants.
export const QuoteLiquidityRequest = Type.Omit(AddLiquidityRequest, ['walletAddress']);
export type QuoteLiquidityRequestType = Static<typeof QuoteLiquidityRequest>;

export const QuoteLiquidityResponse = Type.Object(
  {
    // The pool this split was computed against — on CLMM the caller need not have
    // named one, and on AMM it keeps the quote self-describing alongside quote-swap.
    poolAddress: Type.Optional(Type.String({ description: 'Pool the quote was computed against' })),
    baseLimited: Type.Boolean(),
    baseTokenAmount: Type.Number({ format: 'decimal' }),
    quoteTokenAmount: Type.Number({ format: 'decimal' }),
    baseTokenAmountMax: Type.Number({ format: 'decimal' }),
    quoteTokenAmountMax: Type.Number({ format: 'decimal' }),
  },
  { $id: 'QuoteLiquidityResponse' },
);
export type QuoteLiquidityResponseType = Static<typeof QuoteLiquidityResponse>;

export const RemoveLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    poolAddress: Type.String(),
    percentageToRemove: Type.Number({
      format: 'decimal',
      minimum: 0,
      maximum: 100,
    }),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
);
export type RemoveLiquidityRequestType = Static<typeof RemoveLiquidityRequest>;

export const RemoveLiquidityResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object(
        {
          fee: Type.Number({ format: 'decimal' }),
          // The venue this write touched. Echoed so a stored record identifies its pool
          // without the request that produced it — the same reason the swap execute
          // responses carry it.
          poolAddress: Type.Optional(Type.String({ description: 'Pool this operation acted on' })),
          // Only AMMs whose positions are discrete accounts have one to name; a
          // fungible-LP AMM holds liquidity as LP tokens against the pool.
          positionAddress: Type.Optional(
            Type.String({ description: 'Position this operation acted on', 'x-connectors': ['meteora'] } as any),
          ),
          // Present only when the removal closed the position account, which is what
          // removing 100% does: the account is closed in the same transaction and its
          // rent comes back. A partial removal leaves the account open and refunds
          // nothing, and fungible-LP AMMs have no account to close, so both omit it
          // rather than reporting a 0 that would read as "closed, refunded nothing".
          positionRentRefunded: Type.Optional(
            Type.Number({
              format: 'decimal',
              description:
                'Native token rent returned when the position account closed. Present only on a 100% removal from an AMM whose positions are accounts.',
              'x-connectors': ['meteora'],
            } as any),
          ),
          baseTokenAmountRemoved: Type.Number({ format: 'decimal' }),
          quoteTokenAmountRemoved: Type.Number({ format: 'decimal' }),
        },
        { $id: 'AmmRemoveLiquidityResponseData' },
      ),
    ),
  },
  { $id: 'AmmRemoveLiquidityResponse' },
);
export type RemoveLiquidityResponseType = Static<typeof RemoveLiquidityResponse>;

// ========================================
// Pool Creation Types
// ========================================

export const CreatePoolRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    baseToken: Type.String({ description: 'Base token symbol or address (becomes the pool base)' }),
    quoteToken: Type.String({ description: 'Quote token symbol or address (becomes the pool quote)' }),
    baseTokenAmount: Type.Number({
      format: 'decimal',
      description: 'Amount of base token to seed the pool with',
    }),
    quoteTokenAmount: Type.Optional(
      Type.Number({
        format: 'decimal',
        description:
          'Amount of quote token to seed with. If provided, the base:quote ratio sets the initial price. ' +
          'If omitted (and no initialPrice), the price is fetched from the market.',
      }),
    ),
    initialPrice: Type.Optional(
      Type.Number({
        format: 'decimal',
        description:
          'Initial price as quote per base. Overrides quoteTokenAmount. If both are omitted, the current ' +
          'market price is fetched from the unified swap router so the pool opens on-market.',
      }),
    ),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
);
export type CreatePoolRequestType = Static<typeof CreatePoolRequest>;

export const CreatePoolResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),
    poolAddress: Type.String({ description: 'Address of the newly created pool' }),
    price: Type.Optional(
      Type.Number({
        format: 'decimal',
        description: 'Initial price the pool was seeded at (quote per base)',
      }),
    ),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object(
        {
          fee: Type.Number({ format: 'decimal' }),
          baseTokenAmountAdded: Type.Number({ format: 'decimal' }),
          quoteTokenAmountAdded: Type.Number({ format: 'decimal' }),
        },
        { $id: 'CreatePoolResponseData' },
      ),
    ),
  },
  { $id: 'CreatePoolResponse' },
);
export type CreatePoolResponseType = Static<typeof CreatePoolResponse>;

// Per-position breakdown entry. Non-fungible-LP AMMs (e.g. Meteora DAMM v2) let a wallet hold
// several NFT positions in one pool; each is individually addressable. Fungible-LP AMMs (Raydium
// CPMM, Uniswap V2) have a single position per wallet and omit this array.
export const PositionDetailSchema = Type.Object(
  {
    positionAddress: Type.String({ description: 'Address of the individual position (NFT position account)' }),
    lpTokenAmount: Type.Number({
      format: 'decimal',
      description: 'Liquidity held by this position (LP units)',
    }),
    baseTokenAmount: Type.Number({ format: 'decimal' }),
    quoteTokenAmount: Type.Number({ format: 'decimal' }),
  },
  { $id: 'PositionDetail' },
);
export type PositionDetail = Static<typeof PositionDetailSchema>;

export const PositionInfoSchema = Type.Object(
  {
    poolAddress: Type.String(),
    walletAddress: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    lpTokenAmount: Type.Number({ format: 'decimal' }),
    baseTokenAmount: Type.Number({ format: 'decimal' }),
    quoteTokenAmount: Type.Number({ format: 'decimal' }),
    price: Type.Number({ format: 'decimal' }),
    // Per-position breakdown for non-fungible-LP AMMs. When a wallet holds multiple positions in a
    // pool, the top-level amounts are the aggregate and each entry here is individually addressable
    // (pass its positionAddress to remove-liquidity / add-liquidity). Omitted for fungible-LP AMMs.
    positions: Type.Optional(Type.Array(PositionDetailSchema)),
  },
  { $id: 'AmmPositionInfo' },
);
export type PositionInfo = Static<typeof PositionInfoSchema>;

export const GetPositionInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
    walletAddress: Type.Optional(Type.String()),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
);
export type GetPositionInfoRequestType = Static<typeof GetPositionInfoRequest>;

// ========================================
// AMM Swap Types
// ========================================

export const QuoteSwapRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    poolAddress: Type.Optional(
      Type.String({
        description: 'Pool address (optional - can be looked up from baseToken and quoteToken)',
      }),
    ),
    baseToken: Type.String({
      description: 'Token to determine swap direction',
    }),
    quoteToken: Type.Optional(
      Type.String({
        description: 'The other token in the pair (optional - required if poolAddress not provided)',
      }),
    ),
    amount: Type.Number({ format: 'decimal' }),
    side: Type.String({
      description: 'Trade direction',
      enum: ['BUY', 'SELL'],
    }),
    slippagePct: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        maximum: 100,
      }),
    ),
  },
  // No $id: this is the pre-refactor shape (per-connector `network`, no `connector`),
  // kept only as the base the unified route composes from. The request actually on the
  // wire is the route's own querystring, which now carries this name as its $id.
);
export type QuoteSwapRequestType = Static<typeof QuoteSwapRequest>;

export const QuoteSwapResponse = Type.Object(
  {
    poolAddress: Type.String(),
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    amountIn: Type.Number({ format: 'decimal' }),
    amountOut: Type.Number({ format: 'decimal' }),
    price: Type.Number({ format: 'decimal' }),
    slippagePct: Type.Optional(Type.Number({ format: 'decimal' })),
    minAmountOut: Type.Number({ format: 'decimal' }),
    maxAmountIn: Type.Number({ format: 'decimal' }),
    priceImpactPct: Type.Number({ format: 'decimal' }),
  },
  // No $id: no route serves this shape. The pool-scoped surfaces answer with the shared
  // Chain* responses, so publishing this would put a name a caller reaches for on a
  // shape they never receive. Kept as the base those responses compose from.
);
export type QuoteSwapResponseType = Static<typeof QuoteSwapResponse>;

export const ExecuteSwapRequest = Type.Object(
  {
    walletAddress: Type.Optional(Type.String()),
    network: Type.Optional(Type.String()),
    poolAddress: Type.Optional(
      Type.String({
        description: 'Pool address (optional - can be looked up from baseToken and quoteToken)',
      }),
    ),
    baseToken: Type.String(),
    quoteToken: Type.Optional(
      Type.String({
        description: 'The other token in the pair (optional - required if poolAddress not provided)',
      }),
    ),
    amount: Type.Number({ format: 'decimal' }),
    side: Type.String({
      enum: ['BUY', 'SELL'],
    }),
    slippagePct: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        maximum: 100,
      }),
    ),
  },
  // No $id: this is the pre-refactor shape (per-connector `network`, no `connector`),
  // kept only as the base the unified route composes from. The request actually on the
  // wire is the route's own schema, which now carries this name as its $id — publishing
  // both would collide, and publishing this one would generate a client that sends the
  // wrong keys.
);
export type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;

export const ExecuteSwapResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object(
        {
          tokenIn: Type.String(),
          tokenOut: Type.String(),
          amountIn: Type.Number({ format: 'decimal' }),
          amountOut: Type.Number({ format: 'decimal' }),
          fee: Type.Number({ format: 'decimal' }),
          baseTokenBalanceChange: Type.Number({ format: 'decimal' }),
          quoteTokenBalanceChange: Type.Number({ format: 'decimal' }),
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
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
);
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

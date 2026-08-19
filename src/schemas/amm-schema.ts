import { Type, Static } from '@sinclair/typebox';

import { TransactionStatus } from './chain-schema';

export const PoolInfoSchema = Type.Object(
  {
    address: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    feePct: Type.Number(),
    price: Type.Number(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
  },
  { $id: 'PoolInfo' },
);
export type PoolInfo = Static<typeof PoolInfoSchema>;

export const GetPoolInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
  },
  { $id: 'GetPoolInfoRequest' },
);
export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;

export const AddLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    poolAddress: Type.String(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    slippagePct: Type.Optional(
      Type.Number({
        format: 'decimal',
        minimum: 0,
        maximum: 100,
      }),
    ),
  },
  { $id: 'AddLiquidityRequest' },
);
export type AddLiquidityRequestType = Static<typeof AddLiquidityRequest>;

export const AddLiquidityResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        fee: Type.Number({ format: 'decimal' }),
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
      }),
    ),
  },
  { $id: 'AddLiquidityResponse' },
);
export type AddLiquidityResponseType = Static<typeof AddLiquidityResponse>;

// ============================================
// Open / close (non-fungible-LP AMMs)
// ============================================
// Mirrors the CLMM open/close responses. Both work on every AMM, but the position
// fields only carry values where a position is a discrete account (Meteora DAMM v2,
// whose positions are NFTs). A fungible-LP AMM issues LP tokens against the pool, so
// there is no position address to report and no account rent to lock or refund —
// positionAddress is absent and the rent figures are 0 because nothing was locked.

export const OpenPositionResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        fee: Type.Number({ format: 'decimal' }),
        positionAddress: Type.Optional(
          Type.String({
            description:
              'Address of the newly opened position. Absent on fungible-LP AMMs, which hold liquidity as LP tokens rather than a position account.',
          }),
        ),
        positionRent: Type.Number({
          format: 'decimal',
          description:
            'Native token locked as rent for the position account, refunded on close. 0 on fungible-LP AMMs, which lock no rent.',
        }),
        baseTokenAmountAdded: Type.Number({ format: 'decimal' }),
        quoteTokenAmountAdded: Type.Number({ format: 'decimal' }),
      }),
    ),
  },
  { $id: 'AmmOpenPositionResponse' },
);
export type OpenPositionResponseType = Static<typeof OpenPositionResponse>;

export const ClosePositionResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        fee: Type.Number({ format: 'decimal' }),
        positionRentRefunded: Type.Number({
          format: 'decimal',
          description:
            'Native token rent returned when the position account closed. 0 on fungible-LP AMMs, which have no position account to close.',
        }),
        baseTokenAmountRemoved: Type.Number({ format: 'decimal' }),
        quoteTokenAmountRemoved: Type.Number({ format: 'decimal' }),
      }),
    ),
  },
  { $id: 'AmmClosePositionResponse' },
);
export type ClosePositionResponseType = Static<typeof ClosePositionResponse>;

export const QuoteLiquidityRequest = Type.Omit(AddLiquidityRequest, ['walletAddress'], {
  $id: 'QuoteLiquidityRequest',
});
export type QuoteLiquidityRequestType = Static<typeof QuoteLiquidityRequest>;

export const QuoteLiquidityResponse = Type.Object(
  {
    baseLimited: Type.Boolean(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    baseTokenAmountMax: Type.Number(),
    quoteTokenAmountMax: Type.Number(),
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
  { $id: 'RemoveLiquidityRequest' },
);
export type RemoveLiquidityRequestType = Static<typeof RemoveLiquidityRequest>;

export const RemoveLiquidityResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        fee: Type.Number(),
        baseTokenAmountRemoved: Type.Number(),
        quoteTokenAmountRemoved: Type.Number(),
      }),
    ),
  },
  { $id: 'RemoveLiquidityResponse' },
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
  { $id: 'CreatePoolRequest' },
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
      Type.Object({
        fee: Type.Number(),
        baseTokenAmountAdded: Type.Number(),
        quoteTokenAmountAdded: Type.Number(),
      }),
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
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
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
    lpTokenAmount: Type.Number(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    price: Type.Number(),
    // Per-position breakdown for non-fungible-LP AMMs. When a wallet holds multiple positions in a
    // pool, the top-level amounts are the aggregate and each entry here is individually addressable
    // (pass its positionAddress to remove-liquidity / add-liquidity). Omitted for fungible-LP AMMs.
    positions: Type.Optional(Type.Array(PositionDetailSchema)),
  },
  { $id: 'PositionInfo' },
);
export type PositionInfo = Static<typeof PositionInfoSchema>;

export const GetPositionInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
    walletAddress: Type.Optional(Type.String()),
  },
  { $id: 'GetPositionInfoRequest' },
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
    amount: Type.Number(),
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
  { $id: 'AmmQuoteSwapRequest' },
);
export type QuoteSwapRequestType = Static<typeof QuoteSwapRequest>;

export const QuoteSwapResponse = Type.Object(
  {
    poolAddress: Type.String(),
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    amountIn: Type.Number(),
    amountOut: Type.Number(),
    price: Type.Number(),
    slippagePct: Type.Optional(Type.Number()),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),
    priceImpactPct: Type.Number(),
  },
  { $id: 'AmmQuoteSwapResponse' },
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
    amount: Type.Number(),
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
  { $id: 'AmmExecuteSwapRequest' },
);
export type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;

export const ExecuteSwapResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        tokenIn: Type.String(),
        tokenOut: Type.String(),
        amountIn: Type.Number(),
        amountOut: Type.Number(),
        fee: Type.Number(),
        baseTokenBalanceChange: Type.Number(),
        quoteTokenBalanceChange: Type.Number(),
        slippagePct: Type.Optional(
          Type.Number({
            format: 'decimal',
            description: 'Slippage tolerance percentage actually applied to the swap',
          }),
        ),
      }),
    ),
  },
  { $id: 'AmmExecuteSwapResponse' },
);
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

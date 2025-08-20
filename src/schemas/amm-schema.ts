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
    slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
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
        fee: Type.Number(),
        baseTokenAmountAdded: Type.Number(),
        quoteTokenAmountAdded: Type.Number(),
      }),
    ),
  },
  { $id: 'AddLiquidityResponse' },
);
export type AddLiquidityResponseType = Static<typeof AddLiquidityResponse>;

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
    percentageToRemove: Type.Number({ minimum: 0, maximum: 100 }),
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
    slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
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
    slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
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
      }),
    ),
  },
  { $id: 'AmmExecuteSwapResponse' },
);
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

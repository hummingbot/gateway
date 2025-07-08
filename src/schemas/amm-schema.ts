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
    poolType: Type.Optional(Type.String()),
    lpMint: Type.Object({
      address: Type.String(),
      decimals: Type.Number(),
    }),
  },
  { $id: 'PoolInfo' },
);
export type PoolInfo = Static<typeof PoolInfoSchema>;

export const GetPoolInfoRequest = Type.Object(
  {
    network: Type.String(),
    poolAddress: Type.String(),
  },
  { $id: 'GetPoolInfoRequest' },
);
export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;

export const AddLiquidityRequest = Type.Object(
  {
    network: Type.String(),
    walletAddress: Type.String(),
    poolAddress: Type.String(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    priorityFeePerCU: Type.Optional(
      Type.Number({
        description:
          'Priority fee per compute unit (lamports on Solana, Gwei on Ethereum)',
      }),
    ),
    computeUnits: Type.Optional(
      Type.Number({
        description: 'Max compute units (Solana) or gas limit (Ethereum)',
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
        fee: Type.Number(),
        baseTokenAmountAdded: Type.Number(),
        quoteTokenAmountAdded: Type.Number(),
      }),
    ),
  },
  { $id: 'AddLiquidityResponse' },
);
export type AddLiquidityResponseType = Static<typeof AddLiquidityResponse>;

export const QuoteLiquidityRequest = Type.Omit(
  AddLiquidityRequest,
  ['walletAddress'],
  { $id: 'QuoteLiquidityRequest' },
);
export type QuoteLiquidityRequestType = Static<typeof QuoteLiquidityRequest>;

export const QuoteLiquidityResponse = Type.Object(
  {
    baseLimited: Type.Boolean(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    baseTokenAmountMax: Type.Number(),
    quoteTokenAmountMax: Type.Number(),
    computeUnits: Type.Number({
      description: 'Estimated compute units for the transaction',
    }),
  },
  { $id: 'QuoteLiquidityResponse' },
);
export type QuoteLiquidityResponseType = Static<typeof QuoteLiquidityResponse>;

export const RemoveLiquidityRequest = Type.Object(
  {
    network: Type.String(),
    walletAddress: Type.String({ examples: ['<solana-wallet-address>'] }),
    poolAddress: Type.String(),
    percentageToRemove: Type.Number({ minimum: 0, maximum: 100 }),
    priorityFeePerCU: Type.Optional(
      Type.Number({
        description:
          'Priority fee per compute unit (lamports on Solana, Gwei on Ethereum)',
      }),
    ),
    computeUnits: Type.Optional(
      Type.Number({
        description: 'Max compute units (Solana) or gas limit (Ethereum)',
      }),
    ),
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
export type RemoveLiquidityResponseType = Static<
  typeof RemoveLiquidityResponse
>;

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
    network: Type.String(),
    poolAddress: Type.String(),
    walletAddress: Type.String(),
  },
  { $id: 'GetPositionInfoRequest' },
);
export type GetPositionInfoRequestType = Static<typeof GetPositionInfoRequest>;

// ========================================
// AMM Swap Types
// ========================================

export const QuoteSwapRequest = Type.Object(
  {
    network: Type.String(),
    poolAddress: Type.String(),
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
  { $id: 'AmmQuoteSwapRequest' },
);
export type QuoteSwapRequestType = Static<typeof QuoteSwapRequest>;

export const QuoteSwapResponse = Type.Object(
  {
    poolAddress: Type.String(),
    estimatedAmountIn: Type.Number(),
    estimatedAmountOut: Type.Number(),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),
    price: Type.Number(),
    priceImpactPct: Type.Number(),
    fee: Type.Number(),
    computeUnits: Type.Number(),
    // Computed fields for clarity
    tokenIn: Type.String(),
    tokenOut: Type.String(),
  },
  { $id: 'AmmQuoteSwapResponse' },
);
export type QuoteSwapResponseType = Static<typeof QuoteSwapResponse>;

export const ExecuteSwapRequest = Type.Object(
  {
    walletAddress: Type.String(),
    network: Type.String(),
    poolAddress: Type.String(),
    baseToken: Type.String(),
    quoteToken: Type.String(),
    amount: Type.Number(),
    side: Type.Enum({ BUY: 'BUY', SELL: 'SELL' }),
    slippagePct: Type.Number({ minimum: 0, maximum: 100 }),
    priorityFeePerCU: Type.Optional(
      Type.Number({
        description:
          'Priority fee per compute unit (lamports on Solana, Gwei on Ethereum)',
      }),
    ),
    computeUnits: Type.Optional(
      Type.Number({
        description: 'Max compute units (Solana) or gas limit (Ethereum)',
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
  { $id: 'AmmExecuteSwapResponse' },
);
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

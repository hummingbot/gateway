import { Type, Static } from '@sinclair/typebox';

import { TransactionStatus } from './chain-schema';

export const FetchPoolsRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ description: 'Network to use' })),
    limit: Type.Optional(
      Type.Number({
        minimum: 1,
        maximum: 100,
        default: 50,
        description: 'Maximum number of pools to return',
      }),
    ),
    query: Type.Optional(
      Type.String({
        description: 'Search query to match pools by name, tokens, or address',
      }),
    ),
    sortBy: Type.Optional(
      Type.String({
        description: 'Sort by field (connector-specific)',
      }),
    ),
  },
  { $id: 'FetchPoolsRequest' },
);

export type FetchPoolsRequestType = Static<typeof FetchPoolsRequest>;

// Standardized pool list item schema for fetch-pools response
export const PoolListItemSchema = Type.Object(
  {
    address: Type.String({ description: 'Pool address' }),
    name: Type.String({ description: 'Pool name (e.g., SOL-USDC)' }),
    baseTokenAddress: Type.String({ description: 'Base token address' }),
    baseTokenSymbol: Type.String({ description: 'Base token symbol' }),
    quoteTokenAddress: Type.String({ description: 'Quote token address' }),
    quoteTokenSymbol: Type.String({ description: 'Quote token symbol' }),
    binStep: Type.Number({ description: 'Bin step / tick spacing' }),
    baseFee: Type.Number({ description: 'Base fee percentage' }),
    price: Type.Number({ description: 'Current price' }),
    tvl: Type.Number({ description: 'Total value locked in USD' }),
    apr: Type.Optional(Type.Number({ description: 'Annual percentage rate' })),
    apy: Type.Optional(Type.Number({ description: 'Annual percentage yield' })),
    volume24h: Type.Optional(Type.Number({ description: '24-hour trading volume' })),
    fees24h: Type.Optional(Type.Number({ description: '24-hour fees collected' })),
  },
  { $id: 'PoolListItem' },
);
export type PoolListItem = Static<typeof PoolListItemSchema>;

export const FetchPoolsResponse = Type.Object(
  {
    pools: Type.Array(PoolListItemSchema),
    total: Type.Number({ description: 'Total number of matching pools' }),
    page: Type.Number({ description: 'Current page number' }),
    pageSize: Type.Number({ description: 'Number of pools per page' }),
  },
  { $id: 'FetchPoolsResponse' },
);
export type FetchPoolsResponseType = Static<typeof FetchPoolsResponse>;

export const GetPositionsOwnedRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.String(),
  },
  { $id: 'GetPositionsOwnedRequest' },
);

export type GetPositionsOwnedRequestType = Static<typeof GetPositionsOwnedRequest>;

export const BinLiquiditySchema = Type.Object(
  {
    binId: Type.Number(),
    price: Type.Number(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
  },
  { $id: 'BinLiquidity' },
);
export type BinLiquidity = Static<typeof BinLiquiditySchema>;

// Base PoolInfo — every CLMM connector returns at least these fields. `bins`
// is the per-tick liquidity distribution around the active tick (matching
// Meteora's `pool-info.bins[]` shape); it's only populated when the request
// includes binCount > 0.
export const PoolInfoSchema = Type.Object(
  {
    address: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    binStep: Type.Optional(Type.Number()), // Optional - Meteora-specific
    feePct: Type.Number(),
    price: Type.Number(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    activeBinId: Type.Number(),
    bins: Type.Optional(Type.Array(BinLiquiditySchema)),
  },
  { $id: 'PoolInfo' },
);
export type PoolInfo = Static<typeof PoolInfoSchema>;

// Meteora-specific extension. `bins` lives on the base now; only the
// Meteora-specific fields (dynamic fee, bin id bounds) are added here.
export const MeteoraPoolInfoSchema = Type.Composite(
  [
    PoolInfoSchema,
    Type.Object({
      dynamicFeePct: Type.Number(),
      minBinId: Type.Number(),
      maxBinId: Type.Number(),
    }),
  ],
  { $id: 'MeteoraPoolInfo' },
);
export type MeteoraPoolInfo = Static<typeof MeteoraPoolInfoSchema>;

export const GetPoolInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
    binCount: Type.Optional(
      Type.Integer({
        description:
          'If > 0, include a `bins` array in the response (per-tickSpacing token amounts around ' +
          'the active tick, mirroring Meteora pool-info.bins[]). Default 0 = skip the bin fetch.',
        default: 0,
        minimum: 0,
        maximum: 401,
      }),
    ),
  },
  { $id: 'GetPoolInfoRequest' },
);
export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;

export const PositionInfoSchema = Type.Object(
  {
    address: Type.String(),
    poolAddress: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    baseFeeAmount: Type.Number(),
    quoteFeeAmount: Type.Number(),
    lowerBinId: Type.Number(),
    upperBinId: Type.Number(),
    lowerPrice: Type.Number(),
    upperPrice: Type.Number(),
    price: Type.Number(),
    rewardTokenAddress: Type.Optional(Type.String()),
    rewardAmount: Type.Optional(Type.Number()),
  },
  { $id: 'PositionInfo' },
);
export type PositionInfo = Static<typeof PositionInfoSchema>;

export const GetPositionInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    positionAddress: Type.String(),
    walletAddress: Type.Optional(Type.String()),
  },
  { $id: 'GetPositionInfoRequest' },
);
export type GetPositionInfoRequestType = Static<typeof GetPositionInfoRequest>;

export const OpenPositionRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    lowerPrice: Type.Number(),
    upperPrice: Type.Number(),
    poolAddress: Type.String(),
    baseTokenAmount: Type.Optional(Type.Number()),
    quoteTokenAmount: Type.Optional(Type.Number()),
    slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  },
  { $id: 'OpenPositionRequest' },
);
export type OpenPositionRequestType = Static<typeof OpenPositionRequest>;

export const OpenPositionResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        fee: Type.Number(),
        positionAddress: Type.String(),
        positionRent: Type.Number(),
        baseTokenAmountAdded: Type.Number(),
        quoteTokenAmountAdded: Type.Number(),
      }),
    ),
  },
  { $id: 'OpenPositionResponse' },
);
export type OpenPositionResponseType = Static<typeof OpenPositionResponse>;

export const AddLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    positionAddress: Type.String(),
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

export const RemoveLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    positionAddress: Type.String(),
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

export const CollectFeesRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    positionAddress: Type.String(),
  },
  { $id: 'CollectFeesRequest' },
);
export type CollectFeesRequestType = Static<typeof CollectFeesRequest>;

export const CollectFeesResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        fee: Type.Number(),
        baseFeeAmountCollected: Type.Number(),
        quoteFeeAmountCollected: Type.Number(),
      }),
    ),
  },
  { $id: 'CollectFeesResponse' },
);
export type CollectFeesResponseType = Static<typeof CollectFeesResponse>;

export const ClosePositionRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.Optional(Type.String()),
    positionAddress: Type.String(),
  },
  { $id: 'ClosePositionRequest' },
);
export type ClosePositionRequestType = Static<typeof ClosePositionRequest>;

export const ClosePositionResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        fee: Type.Number(),
        positionRentRefunded: Type.Number(),
        baseTokenAmountRemoved: Type.Number(),
        quoteTokenAmountRemoved: Type.Number(),
        baseFeeAmountCollected: Type.Number(),
        quoteFeeAmountCollected: Type.Number(),
      }),
    ),
  },
  { $id: 'ClosePositionResponse' },
);
export type ClosePositionResponseType = Static<typeof ClosePositionResponse>;

export const QuotePositionRequest = Type.Omit(OpenPositionRequest, ['walletAddress'], { $id: 'QuotePositionRequest' });
export type QuotePositionRequestType = Static<typeof QuotePositionRequest>;

export const QuotePositionResponse = Type.Object(
  {
    baseLimited: Type.Boolean(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    baseTokenAmountMax: Type.Number(),
    quoteTokenAmountMax: Type.Number(),
    liquidity: Type.Optional(Type.Any()),
  },
  { $id: 'QuotePositionResponse' },
);
export type QuotePositionResponseType = Static<typeof QuotePositionResponse>;

// ========================================
// CLMM Swap Types
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
  { $id: 'ClmmQuoteSwapRequest' },
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
  { $id: 'ClmmQuoteSwapResponse' },
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
  { $id: 'ClmmExecuteSwapRequest' },
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
  { $id: 'ClmmExecuteSwapResponse' },
);
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

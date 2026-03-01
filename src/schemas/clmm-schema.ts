import { Type, Static } from '@sinclair/typebox';

import { TransactionStatus } from './chain-schema';

export const FetchPoolsRequest = Type.Object(
  {
    network: Type.Optional(Type.String()), // Network
    limit: Type.Optional(Type.Number({ minimum: 1 })), // Maximum number of pools to return
    tokenA: Type.Optional(Type.String()), // First token symbol or address
    tokenB: Type.Optional(Type.String()), // Second token symbol or address
  },
  { $id: 'FetchPoolsRequest' },
);

export type FetchPoolsRequestType = Static<typeof FetchPoolsRequest>;

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

// Base PoolInfo without Meteora-specific fields
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
  },
  { $id: 'PoolInfo' },
);
export type PoolInfo = Static<typeof PoolInfoSchema>;

// Meteora-specific extension
export const MeteoraPoolInfoSchema = Type.Composite(
  [
    PoolInfoSchema,
    Type.Object({
      dynamicFeePct: Type.Number(),
      minBinId: Type.Number(),
      maxBinId: Type.Number(),
      bins: Type.Array(BinLiquiditySchema),
    }),
  ],
  { $id: 'MeteoraPoolInfo' },
);
export type MeteoraPoolInfo = Static<typeof MeteoraPoolInfoSchema>;

export const GetPoolInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
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
    liquidity: Type.Optional(Type.String({ description: 'Liquidity amount in the position' })),
    inRange: Type.Optional(Type.Boolean({ description: 'Whether the position is currently in range (active)' })),
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
        // Pool information
        poolAddress: Type.Optional(Type.String({ description: 'Pool contract address' })),
        baseTokenAddress: Type.Optional(Type.String({ description: 'Base token contract address' })),
        baseTokenSymbol: Type.Optional(Type.String({ description: 'Base token symbol (e.g. CAKE)' })),
        quoteTokenAddress: Type.Optional(Type.String({ description: 'Quote token contract address' })),
        quoteTokenSymbol: Type.Optional(Type.String({ description: 'Quote token symbol (e.g. USDT)' })),
        feePct: Type.Optional(Type.Number({ description: 'Pool fee as a percentage (e.g. 0.25 for 0.25%)' })),
        currentPrice: Type.Optional(Type.Number({ description: 'Current pool price in base/quote terms' })),
        lowerPrice: Type.Optional(Type.Number({ description: 'Position lower price bound' })),
        upperPrice: Type.Optional(Type.Number({ description: 'Position upper price bound' })),
        liquidity: Type.Optional(Type.String({ description: 'Raw liquidity units of the new position' })),
        tickLower: Type.Optional(Type.Number({ description: 'Lower tick of the position' })),
        tickUpper: Type.Optional(Type.Number({ description: 'Upper tick of the position' })),
        inRange: Type.Optional(
          Type.Boolean({ description: 'Whether the position is currently in range and earning fees' }),
        ),
        // MasterChef reward info (for APR estimation)
        masterchefPoolId: Type.Optional(
          Type.Number({ description: 'MasterChef pool ID; 0 means pool is not registered' }),
        ),
        cakePerSecond: Type.Optional(
          Type.Number({
            description:
              'CAKE tokens distributed per second across the full pool; use with pool liquidity to estimate APR',
          }),
        ),
        rewardEndTime: Type.Optional(
          Type.Number({ description: 'Unix timestamp when the current CAKE reward period ends' }),
        ),
        isRewardActive: Type.Optional(
          Type.Boolean({ description: 'Whether the CAKE reward period is currently active' }),
        ),
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
        // Token identification
        baseTokenAddress: Type.Optional(Type.String({ description: 'Base token contract address' })),
        baseTokenSymbol: Type.Optional(Type.String({ description: 'Base token symbol (e.g. CAKE)' })),
        quoteTokenAddress: Type.Optional(Type.String({ description: 'Quote token contract address' })),
        quoteTokenSymbol: Type.Optional(Type.String({ description: 'Quote token symbol (e.g. USDT)' })),
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

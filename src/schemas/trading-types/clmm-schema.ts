import { Type, Static } from '@sinclair/typebox';

export const FetchPoolsRequest = Type.Object({
  network: Type.Optional(Type.String()), // Network (defaults to mainnet)
  limit: Type.Optional(Type.Number({ minimum: 1 })), // Maximum number of pools to return
  tokenA: Type.Optional(Type.String()), // First token symbol or address
  tokenB: Type.Optional(Type.String()), // Second token symbol or address
}, { $id: 'FetchPoolsRequest' });

export type FetchPoolsRequestType = Static<typeof FetchPoolsRequest>;

export const BinLiquiditySchema = Type.Object({
  binId: Type.Number(),
  price: Type.Number(),
  baseTokenAmount: Type.Number(),
  quoteTokenAmount: Type.Number(),
}, { $id: 'BinLiquidity' });
export type BinLiquidity = Static<typeof BinLiquiditySchema>;

// Base PoolInfo without Meteora-specific fields
export const PoolInfoSchema = Type.Object({
  address: Type.String(),
  baseTokenAddress: Type.String(),
  quoteTokenAddress: Type.String(),
  binStep: Type.Number(),
  feePct: Type.Number(),
  price: Type.Number(),
  baseTokenAmount: Type.Number(),
  quoteTokenAmount: Type.Number(),
  activeBinId: Type.Number(),
}, { $id: 'PoolInfo' });
export type PoolInfo = Static<typeof PoolInfoSchema>;

// Meteora-specific extension
export const MeteoraPoolInfoSchema = Type.Composite([
  PoolInfoSchema,
  Type.Object({
    dynamicFeePct: Type.Number(),
    minBinId: Type.Number(),
    maxBinId: Type.Number(),
    bins: Type.Array(BinLiquiditySchema),
  })
], { $id: 'MeteoraPoolInfo' });
export type MeteoraPoolInfo = Static<typeof MeteoraPoolInfoSchema>;

export const GetPoolInfoRequest = Type.Object({
  network: Type.Optional(Type.String()),
  poolAddress: Type.String(),
}, { $id: 'GetPoolInfoRequest' });
export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;

export const PositionInfoSchema = Type.Object({
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
}, { $id: 'PositionInfo' });
export type PositionInfo = Static<typeof PositionInfoSchema>;

export const GetPositionInfoRequest = Type.Object({
  network: Type.Optional(Type.String()),
  positionAddress: Type.String(),
  walletAddress: Type.String(),
}, { $id: 'GetPositionInfoRequest' });
export type GetPositionInfoRequestType = Static<typeof GetPositionInfoRequest>;

export const OpenPositionRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  lowerPrice: Type.Number(),
  upperPrice: Type.Number(),
  poolAddress: Type.String(),
  baseTokenAmount: Type.Optional(Type.Number()),
  quoteTokenAmount: Type.Optional(Type.Number()),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
}, { $id: 'OpenPositionRequest' });
export type OpenPositionRequestType = Static<typeof OpenPositionRequest>;

export const OpenPositionResponse = Type.Object({
  signature: Type.String(),
  fee: Type.Number(),
  positionAddress: Type.String(),
  positionRent: Type.Number(),
  baseTokenAmountAdded: Type.Number(),
  quoteTokenAmountAdded: Type.Number(),
}, { $id: 'OpenPositionResponse' });
export type OpenPositionResponseType = Static<typeof OpenPositionResponse>;

export const AddLiquidityRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  positionAddress: Type.String(),
  baseTokenAmount: Type.Number(),
  quoteTokenAmount: Type.Number(),
  slippagePct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
}, { $id: 'AddLiquidityRequest' });
export type AddLiquidityRequestType = Static<typeof AddLiquidityRequest>;
  
export const AddLiquidityResponse = Type.Object({
  signature: Type.String(),
  fee: Type.Number(),
  baseTokenAmountAdded: Type.Number(),
  quoteTokenAmountAdded: Type.Number(),
}, { $id: 'AddLiquidityResponse' });
export type AddLiquidityResponseType = Static<typeof AddLiquidityResponse>;

export const RemoveLiquidityRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  positionAddress: Type.String(),
  percentageToRemove: Type.Number({ minimum: 0, maximum: 100 }),
}, { $id: 'RemoveLiquidityRequest' });
export type RemoveLiquidityRequestType = Static<typeof RemoveLiquidityRequest>;

export const RemoveLiquidityResponse = Type.Object({
  signature: Type.String(),
  fee: Type.Number(),
  baseTokenAmountRemoved: Type.Number(),
  quoteTokenAmountRemoved: Type.Number(),
}, { $id: 'RemoveLiquidityResponse' });
export type RemoveLiquidityResponseType = Static<typeof RemoveLiquidityResponse>;

export const CollectFeesRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  positionAddress: Type.String(),
}, { $id: 'CollectFeesRequest' });
export type CollectFeesRequestType = Static<typeof CollectFeesRequest>;

export const CollectFeesResponse = Type.Object({
  signature: Type.String(),
  fee: Type.Number(),
  baseFeeAmountCollected: Type.Number(),
  quoteFeeAmountCollected: Type.Number(),
}, { $id: 'CollectFeesResponse' });
export type CollectFeesResponseType = Static<typeof CollectFeesResponse>;

export const ClosePositionRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  positionAddress: Type.String(),
}, { $id: 'ClosePositionRequest' });
export type ClosePositionRequestType = Static<typeof ClosePositionRequest>;

export const ClosePositionResponse = Type.Object({
  signature: Type.String(),
  fee: Type.Number(),
  positionRentRefunded: Type.Number(),
  baseTokenAmountRemoved: Type.Number(),
  quoteTokenAmountRemoved: Type.Number(),
  baseFeeAmountCollected: Type.Number(),
  quoteFeeAmountCollected: Type.Number(),
}, { $id: 'ClosePositionResponse' });
export type ClosePositionResponseType = Static<typeof ClosePositionResponse>;

export const QuotePositionRequest = Type.Omit(
  OpenPositionRequest,
  ['walletAddress'],
  { $id: 'QuotePositionRequest' }
);
export type QuotePositionRequestType = Static<typeof QuotePositionRequest>;

export const QuotePositionResponse = Type.Object({
  baseLimited: Type.Boolean(),
  baseTokenAmount: Type.Number(),
  quoteTokenAmount: Type.Number(),
  baseTokenAmountMax: Type.Number(),
  quoteTokenAmountMax: Type.Number(),
  liquidity: Type.Optional(Type.Any()),
}, { $id: 'QuotePositionResponse' });
export type QuotePositionResponseType = Static<typeof QuotePositionResponse>;

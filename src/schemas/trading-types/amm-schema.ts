import { Type, Static } from '@sinclair/typebox';

// Add ListPoolsRequest and ListPoolsResponse schemas
export const ListPoolsRequest = Type.Object({
  network: Type.Optional(Type.String()), // Network (defaults to mainnet-beta for Raydium)
}, { $id: 'ListPoolsRequest' });
// noinspection JSUnusedGlobalSymbols
export type ListPoolsRequestType = Static<typeof ListPoolsRequest>;

export const PoolItemSchema = Type.Object({
  address: Type.String(),
  type: Type.String(),
  tokens: Type.Array(Type.String()),
}, { $id: 'PoolItem' });
export type PoolItem = Static<typeof PoolItemSchema>;

export const ListPoolsResponse = Type.Object({
  pools: Type.Array(PoolItemSchema),
}, { $id: 'ListPoolsResponse' });
// noinspection JSUnusedGlobalSymbols
export type ListPoolsResponseType = Static<typeof ListPoolsResponse>;

export const PoolInfoSchema = Type.Object({
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
      decimals: Type.Number()
    }),
  }, { $id: 'PoolInfo' });
  export type PoolInfo = Static<typeof PoolInfoSchema>;

  export const GetPoolInfoRequest = Type.Object({
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
  }, { $id: 'GetPoolInfoRequest' });
  export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;
  
  export const AddLiquidityRequest = Type.Object({
    network: Type.Optional(Type.String()),
    walletAddress: Type.String(),
    poolAddress: Type.String(),
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

  export const QuoteLiquidityRequest = Type.Omit(
    AddLiquidityRequest,
    ['walletAddress'],
    { $id: 'QuoteLiquidityRequest' }
  );
  export type QuoteLiquidityRequestType = Static<typeof QuoteLiquidityRequest>;
  
  export const QuoteLiquidityResponse = Type.Object({
    baseLimited: Type.Boolean(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    baseTokenAmountMax: Type.Number(),
    quoteTokenAmountMax: Type.Number(),
  }, { $id: 'QuoteLiquidityResponse' });
  export type QuoteLiquidityResponseType = Static<typeof QuoteLiquidityResponse>;

  export const RemoveLiquidityRequest = Type.Object({
    network: Type.Optional(Type.String()),
    walletAddress: Type.String({ examples: ['<solana-wallet-address>'] }),
    poolAddress: Type.String(),
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

  export const PositionInfoSchema = Type.Object({
    poolAddress: Type.String(),
    walletAddress: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    lpTokenAmount: Type.Number(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    price: Type.Number(),
  }, { $id: 'PositionInfo' });
  export type PositionInfo = Static<typeof PositionInfoSchema>;

  export const GetPositionInfoRequest = Type.Object({
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
    walletAddress: Type.String(),
  }, { $id: 'GetPositionInfoRequest' });
  export type GetPositionInfoRequestType = Static<typeof GetPositionInfoRequest>;


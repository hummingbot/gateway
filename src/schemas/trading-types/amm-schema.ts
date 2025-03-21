import { Type, Static } from '@sinclair/typebox';

export const PoolInfoSchema = Type.Object({
    address: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    feePct: Type.Number(),
    price: Type.Number(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
    poolType: Type.Optional(Type.String()),
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


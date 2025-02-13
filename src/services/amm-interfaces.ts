import { Type, Static } from '@sinclair/typebox';

// Base PoolInfo without Meteora-specific fields
export const PoolInfoSchema = Type.Object({
    address: Type.String(),
    baseTokenAddress: Type.String(),
    quoteTokenAddress: Type.String(),
    feePct: Type.Number(),
    price: Type.Number(),
    baseTokenAmount: Type.Number(),
    quoteTokenAmount: Type.Number(),
  }, { $id: 'PoolInfo' });
  export type PoolInfo = Static<typeof PoolInfoSchema>;

  export const GetPoolInfoRequest = Type.Object({
    network: Type.Optional(Type.String()),
    poolAddress: Type.String(),
  }, { $id: 'GetPoolInfoRequest' });
  export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;
  
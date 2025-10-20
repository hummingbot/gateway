import { Static, Type } from '@sinclair/typebox';

// Base request with network
const BaseRequest = Type.Object({
  network: Type.String({ description: 'Solana network (mainnet-beta or devnet)' }),
});

// CLMM Pool Info Request
export const PancakeswapSolClmmGetPoolInfoRequest = Type.Intersect([
  BaseRequest,
  Type.Object({
    poolAddress: Type.String({ description: 'Pool address' }),
  }),
]);

export type PancakeswapSolClmmGetPoolInfoRequestType = Static<typeof PancakeswapSolClmmGetPoolInfoRequest>;

// CLMM Open Position Request
export const PancakeswapSolClmmOpenPositionRequest = Type.Intersect([
  BaseRequest,
  Type.Object({
    walletAddress: Type.String({ description: 'Wallet address' }),
    poolAddress: Type.String({ description: 'Pool address' }),
    lowerPrice: Type.Number({ description: 'Lower price bound' }),
    upperPrice: Type.Number({ description: 'Upper price bound' }),
    baseTokenAmount: Type.Optional(Type.Number({ description: 'Base token amount' })),
    quoteTokenAmount: Type.Optional(Type.Number({ description: 'Quote token amount' })),
    slippagePct: Type.Optional(Type.Number({ description: 'Slippage percentage' })),
  }),
]);

export type PancakeswapSolClmmOpenPositionRequestType = Static<typeof PancakeswapSolClmmOpenPositionRequest>;

// CLMM Position Info Request
export const PancakeswapSolClmmGetPositionInfoRequest = Type.Intersect([
  BaseRequest,
  Type.Object({
    positionAddress: Type.String({ description: 'Position NFT address' }),
  }),
]);

export type PancakeswapSolClmmGetPositionInfoRequestType = Static<typeof PancakeswapSolClmmGetPositionInfoRequest>;

// CLMM Get Positions Owned Request
export const PancakeswapSolClmmGetPositionsOwnedRequest = Type.Intersect([
  BaseRequest,
  Type.Object({
    poolAddress: Type.String({ description: 'Pool address' }),
    walletAddress: Type.String({ description: 'Wallet address' }),
  }),
]);

export type PancakeswapSolClmmGetPositionsOwnedRequestType = Static<typeof PancakeswapSolClmmGetPositionsOwnedRequest>;

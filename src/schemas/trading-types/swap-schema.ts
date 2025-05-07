import { Type, Static } from '@sinclair/typebox';

// Extended PoolInfo schema for swap connectors
export const PoolInfoSchema = Type.Object({
  address: Type.String(),
  baseTokenAddress: Type.String(),
  quoteTokenAddress: Type.String(),
  feePct: Type.Optional(Type.Number()),
  price: Type.Optional(Type.Number()),
  baseTokenAmount: Type.Optional(Type.Number()),
  quoteTokenAmount: Type.Optional(Type.Number()),
  poolType: Type.Optional(Type.String()),
  connectorName: Type.Optional(Type.String()), // Which connector this pool belongs to
  marketType: Type.Optional(Type.String()), // For Raydium: amm, clmm, launchpad
  lpMint: Type.Optional(
    Type.Object({
      address: Type.Optional(Type.String()),
      decimals: Type.Optional(Type.Number())
    })
  ),
}, { $id: 'SwapPoolInfo' });
export type PoolInfo = Static<typeof PoolInfoSchema>;

// Request for getting pool info
export const GetPoolInfoRequest = Type.Object({
  network: Type.Optional(Type.String()),
  connector: Type.Optional(Type.String()), // Which connector to check (raydium, jupiter, etc.)
  marketType: Type.Optional(Type.String()), // For Raydium: amm, clmm, launchpad
  baseToken: Type.String({ examples: ['SOL'] }),
  quoteToken: Type.String({ examples: ['USDC'] }),
  poolAddress: Type.Optional(Type.String()),
}, { $id: 'GetSwapPoolInfoRequest' });
export type GetPoolInfoRequestType = Static<typeof GetPoolInfoRequest>;

// Response format for pool info
export const GetPoolInfoResponse = Type.Object({
  pools: Type.Array(PoolInfoSchema)
}, { $id: 'GetSwapPoolInfoResponse' });
export type GetPoolInfoResponseType = Static<typeof GetPoolInfoResponse>;

export const GetSwapQuoteRequest = Type.Object({
  network: Type.Optional(Type.String()),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.String({ 
    enum: ['BUY', 'SELL'],
    description: 'Trade direction'
  }),
  slippagePct: Type.Optional(Type.Number()),
  poolAddress: Type.Optional(Type.String()),
  feeTier: Type.Optional(Type.String({ 
    enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH'] 
  })),
}, { $id: 'GetSwapQuoteRequest' });
export type GetSwapQuoteRequestType = Static<typeof GetSwapQuoteRequest>;

export const GetSwapQuoteResponse = Type.Object({
  poolAddress: Type.Optional(Type.String()),
  estimatedAmountIn: Type.Number(),
  estimatedAmountOut: Type.Number(),
  minAmountOut: Type.Number(),
  maxAmountIn: Type.Number(),
  baseTokenBalanceChange: Type.Number(),
  quoteTokenBalanceChange: Type.Number(),
  price: Type.Number(),
  gasPrice: Type.Number(),
  gasLimit: Type.Number(),
  gasCost: Type.Number(),
}, { $id: 'GetSwapQuoteResponse' });
export type GetSwapQuoteResponseType = Static<typeof GetSwapQuoteResponse>;

export const ExecuteSwapRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.String({ 
    enum: ['BUY', 'SELL'],
    description: 'Trade direction'
  }),
  slippagePct: Type.Optional(Type.Number()),
  poolAddress: Type.Optional(Type.String()),
  feeTier: Type.Optional(Type.String({ 
    enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH'] 
  })),
}, { $id: 'ExecuteSwapRequest' });

export type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;

export const ExecuteSwapResponse = Type.Object({
  signature: Type.String(),
  totalInputSwapped: Type.Number(),
  totalOutputSwapped: Type.Number(),
  fee: Type.Number(),
  baseTokenBalanceChange: Type.Number(),
  quoteTokenBalanceChange: Type.Number(),
});
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

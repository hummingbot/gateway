import { Type, Static } from '@sinclair/typebox';

export const GetSwapQuoteRequest = Type.Object({
  network: Type.Optional(Type.String()),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.String({ 
    enum: ['buy', 'sell'],
    description: 'Trade direction'
  }),
  poolAddress: Type.Optional(Type.String()),
  slippagePct: Type.Optional(Type.Number()),
}, { $id: 'GetSwapQuoteRequest' });
export type GetSwapQuoteRequestType = Static<typeof GetSwapQuoteRequest>;

export const GetSwapQuoteResponse = Type.Object({
  estimatedAmountIn: Type.Number(),
  estimatedAmountOut: Type.Number(),
  minAmountOut: Type.Number(),
  maxAmountIn: Type.Number(),
  baseTokenBalanceChange: Type.Number(),
  quoteTokenBalanceChange: Type.Number(),
  price: Type.Number(),
  gasPrice: Type.Optional(Type.Number()),
  gasLimit: Type.Optional(Type.Number()),
  gasCost: Type.Optional(Type.Number()),
}, { $id: 'GetSwapQuoteResponse' });
export type GetSwapQuoteResponseType = Static<typeof GetSwapQuoteResponse>;

export const ExecuteSwapRequest = Type.Object({
  network: Type.Optional(Type.String()),
  walletAddress: Type.String(),
  baseToken: Type.String(),
  quoteToken: Type.String(),
  amount: Type.Number(),
  side: Type.String({ 
    enum: ['buy', 'sell'],
    description: 'Trade direction'
  }),
  poolAddress: Type.Optional(Type.String()),
  slippagePct: Type.Optional(Type.Number()),
});
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

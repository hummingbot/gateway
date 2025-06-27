import { Type, Static } from '@sinclair/typebox';
import { TransactionStatus } from './chain-schema';

export const GetSwapQuoteRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    baseToken: Type.Optional(Type.String()),
    quoteToken: Type.Optional(Type.String()),
    amount: Type.Number(),
    side: Type.String({
      enum: ['BUY', 'SELL'],
      description: 'Trade direction',
    }),
    slippagePct: Type.Optional(Type.Number()),
    poolAddress: Type.Optional(Type.String()),
  },
  { $id: 'GetSwapQuoteRequest' },
);
export type GetSwapQuoteRequestType = Static<typeof GetSwapQuoteRequest>;

export const GetSwapQuoteResponse = Type.Object(
  {
    poolAddress: Type.Optional(Type.String()),
    estimatedAmountIn: Type.Number(),
    estimatedAmountOut: Type.Number(),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),
    baseTokenBalanceChange: Type.Number(),
    quoteTokenBalanceChange: Type.Number(),
    price: Type.Number(),
    computeUnits: Type.Number(), // Compute units required for this swap
  },
  { $id: 'GetSwapQuoteResponse' },
);
export type GetSwapQuoteResponseType = Static<typeof GetSwapQuoteResponse>;

export const ExecuteSwapRequest = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.String(),
    baseToken: Type.String(),
    quoteToken: Type.String(),
    amount: Type.Number(),
    side: Type.String({
      enum: ['BUY', 'SELL'],
      description: 'Trade direction',
    }),
    slippagePct: Type.Optional(Type.Number()),
    poolAddress: Type.Optional(Type.String()),
    // New optional fee parameters
    priorityFeePerCU: Type.Optional(Type.Number({
      description: 'Priority fee per compute unit (lamports on Solana, Gwei on Ethereum)'
    })),
    computeUnits: Type.Optional(Type.Number({
      description: 'Compute units for transaction'
    })),
  },
  { $id: 'ExecuteSwapRequest' },
);

export type ExecuteSwapRequestType = Static<typeof ExecuteSwapRequest>;


export const ExecuteSwapResponse = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),
  
  // Only included when status = CONFIRMED
  data: Type.Optional(Type.Object({
    totalInputSwapped: Type.Number(),
    totalOutputSwapped: Type.Number(),
    fee: Type.Number(),
    baseTokenBalanceChange: Type.Number(),
    quoteTokenBalanceChange: Type.Number(),
  })),
});
export type ExecuteSwapResponseType = Static<typeof ExecuteSwapResponse>;

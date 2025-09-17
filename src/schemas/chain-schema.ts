import { Type, Static } from '@sinclair/typebox';

// Transaction status enum
export enum TransactionStatus {
  PENDING = 0,
  CONFIRMED = 1,
  FAILED = -1,
}

export const EstimateGasRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
  },
  { $id: 'EstimateGasRequest' },
);
export type EstimateGasRequestType = Static<typeof EstimateGasRequestSchema>;

export const EstimateGasResponseSchema = Type.Object(
  {
    feePerComputeUnit: Type.Number(), // Fee per compute unit
    denomination: Type.String(), // Denomination: "lamports" or "gwei"
    computeUnits: Type.Number(), // Default compute units/gas limit used for fee calculation
    feeAsset: Type.String(), // Native currency symbol from network config (ETH, SOL, etc.)
    fee: Type.Number(), // Total fee calculated using default gas/compute limits
    timestamp: Type.Number(), // Unix timestamp when estimate was made
  },
  { $id: 'EstimateGasResponse' },
);
export type EstimateGasResponse = Static<typeof EstimateGasResponseSchema>;

export const BalanceRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
    tokens: Type.Optional(
      Type.Array(Type.String(), {
        description: 'a list of token symbols or addresses',
      }),
    ),
    fetchAll: Type.Optional(
      Type.Boolean({
        description: 'fetch all tokens in wallet, not just those in token list (default: false)',
      }),
    ),
  },
  { $id: 'BalanceRequest' },
);
export type BalanceRequestType = Static<typeof BalanceRequestSchema>;

export const BalanceResponseSchema = Type.Object(
  {
    balances: Type.Record(Type.String(), Type.Number()),
  },
  { $id: 'BalanceResponse' },
);
export type BalanceResponseType = Static<typeof BalanceResponseSchema>;

export const TokensRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    tokenSymbols: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  },
  { $id: 'TokensRequest' },
);
export type TokensRequestType = Static<typeof TokensRequestSchema>;

export const TokensResponseSchema = Type.Object(
  {
    tokens: Type.Array(
      Type.Object({
        symbol: Type.String(),
        address: Type.String(),
        decimals: Type.Number(),
        name: Type.String(),
      }),
    ),
  },
  { $id: 'TokensResponse' },
);
export type TokensResponseType = Static<typeof TokensResponseSchema>;

export const PollRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    signature: Type.String({ description: 'Transaction signature/hash' }),
    tokens: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Array of token symbols or addresses for balance change calculation',
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Wallet address for balance change calculation (required if tokens provided)',
      }),
    ),
  },
  { $id: 'PollRequest' },
);
export type PollRequestType = Static<typeof PollRequestSchema>;

export const PollResponseSchema = Type.Object(
  {
    currentBlock: Type.Number(),
    signature: Type.String(),
    txBlock: Type.Union([Type.Number(), Type.Null()]),
    txStatus: Type.Number(),
    fee: Type.Union([Type.Number(), Type.Null()]),
    tokenBalanceChanges: Type.Optional(
      Type.Record(Type.String(), Type.Number(), {
        description: 'Dictionary of token balance changes keyed by token input value (symbol or address)',
      }),
    ),
    txData: Type.Union([Type.Record(Type.String(), Type.Any()), Type.Null()]),
    error: Type.Optional(Type.String()),
  },
  { $id: 'PollResponse' },
);
export type PollResponseType = Static<typeof PollResponseSchema>;

export const StatusRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
  },
  { $id: 'StatusRequest' },
);
export type StatusRequestType = Static<typeof StatusRequestSchema>;

export const StatusResponseSchema = Type.Object(
  {
    chain: Type.String(),
    network: Type.String(),
    rpcUrl: Type.String(),
    rpcProvider: Type.String(),
    currentBlockNumber: Type.Number(),
    nativeCurrency: Type.String(),
  },
  { $id: 'StatusResponse' },
);
export type StatusResponseType = Static<typeof StatusResponseSchema>;

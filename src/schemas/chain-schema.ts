import { Type, Static } from '@sinclair/typebox';

// Transaction status enum
export enum TransactionStatus {
  PENDING = 0,
  CONFIRMED = 1,
  FAILED = -1,
}

export const EstimateGasRequestSchema = Type.Object(
  {
    network: Type.String(),
    gasLimit: Type.Optional(Type.Number()),
  },
  { $id: 'EstimateGasRequest' },
);
export type EstimateGasRequestType = Static<typeof EstimateGasRequestSchema>;

export const EstimateGasResponseSchema = Type.Object(
  {
    feePerComputeUnit: Type.Number(), // Fee per compute unit
    denomination: Type.String(), // Denomination: "lamports" or "gwei"
    timestamp: Type.Number(), // Unix timestamp when estimate was made
  },
  { $id: 'EstimateGasResponse' },
);
export type EstimateGasResponse = Static<typeof EstimateGasResponseSchema>;

export const BalanceRequestSchema = Type.Object(
  {
    network: Type.String(),
    address: Type.String(),
    tokens: Type.Optional(
      Type.Array(Type.String(), {
        description: 'a list of token symbols or addresses',
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
    network: Type.String(),
    tokenSymbols: Type.Optional(
      Type.Union([Type.String(), Type.Array(Type.String())]),
    ),
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
    network: Type.String(),
    signature: Type.String({ description: 'Transaction signature/hash' }),
    baseToken: Type.Optional(
      Type.String({
        description:
          'Base token symbol or address for balance change calculation',
      }),
    ),
    quoteToken: Type.Optional(
      Type.String({
        description:
          'Quote token symbol or address for balance change calculation',
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description:
          'Wallet address for balance change calculation (required if tokens provided)',
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
    txData: Type.Union([Type.Record(Type.String(), Type.Any()), Type.Null()]),
    fee: Type.Union([Type.Number(), Type.Null()]),
    baseTokenBalanceChange: Type.Optional(
      Type.Number({ description: 'Balance change for base token' }),
    ),
    quoteTokenBalanceChange: Type.Optional(
      Type.Number({ description: 'Balance change for quote token' }),
    ),
    error: Type.Optional(Type.String()),
  },
  { $id: 'PollResponse' },
);
export type PollResponseType = Static<typeof PollResponseSchema>;

export const StatusRequestSchema = Type.Object(
  {
    network: Type.String(),
  },
  { $id: 'StatusRequest' },
);
export type StatusRequestType = Static<typeof StatusRequestSchema>;

export const StatusResponseSchema = Type.Object(
  {
    chain: Type.String(),
    network: Type.String(),
    rpcUrl: Type.String(),
    currentBlockNumber: Type.Number(),
    nativeCurrency: Type.String(),
  },
  { $id: 'StatusResponse' },
);
export type StatusResponseType = Static<typeof StatusResponseSchema>;

// Base schemas
export const NetworkSelectionSchema = Type.Object(
  {
    chain: Type.String(),
    network: Type.String(),
  },
  { $id: 'NetworkSelection' },
);

// Allowances schemas
export const AllowancesRequestSchema = Type.Intersect(
  [
    NetworkSelectionSchema,
    Type.Object({
      address: Type.String({ description: "the user's public Ethereum key" }),
      spender: Type.String({
        description:
          'connector name (e.g., uniswap/clmm, uniswap/amm, uniswap) or the address of the contract that will be allowed to spend tokens',
      }),
      tokens: Type.Array(Type.String(), {
        description: 'a list of token symbols or addresses',
      }),
    }),
  ],
  { $id: 'AllowancesRequest' },
);
export type AllowancesRequestType = Static<typeof AllowancesRequestSchema>;

export const AllowancesResponseSchema = Type.Object(
  {
    spender: Type.String(),
    approvals: Type.Record(Type.String(), Type.String()),
  },
  { $id: 'AllowancesResponse' },
);
export type AllowancesResponseType = Static<typeof AllowancesResponseSchema>;

// Approve schemas
export const ApproveRequestSchema = Type.Intersect(
  [
    NetworkSelectionSchema,
    Type.Object({
      amount: Type.Optional(
        Type.String({
          description:
            'the amount the spender will be approved to use, defaults to unlimited approval (MaxUint256) if not provided',
        }),
      ),
      address: Type.String({ description: "the user's public Ethereum key" }),
      spender: Type.String({
        description:
          'connector name (e.g., uniswap/clmm, uniswap/amm, uniswap) or the address of the contract that will be allowed to spend tokens',
      }),
      token: Type.String({
        description: 'the token symbol the spender will be approved for',
      }),
    }),
  ],
  { $id: 'ApproveRequest' },
);
export type ApproveRequestType = Static<typeof ApproveRequestSchema>;

export const CustomTransactionSchema = Type.Object(
  {
    data: Type.String(),
    to: Type.String(),
    // Minimal definition, expand as needed
  },
  { $id: 'CustomTransaction' },
);

export const ApproveResponseSchema = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        tokenAddress: Type.String(),
        spender: Type.String(),
        amount: Type.String(),
        nonce: Type.Number(),
        fee: Type.String(),
      }),
    ),
  },
  { $id: 'ApproveResponse' },
);
export type ApproveResponseType = Static<typeof ApproveResponseSchema>;

// Wrap ETH to WETH schemas
export const WrapRequestSchema = Type.Object(
  {
    network: Type.String(),
    address: Type.String({ description: "the user's public Ethereum key" }),
    amount: Type.String({ description: 'the amount of ETH to wrap into WETH' }),
  },
  { $id: 'WrapRequest' },
);
export type WrapRequestType = Static<typeof WrapRequestSchema>;

export const WrapResponseSchema = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        nonce: Type.Number(),
        fee: Type.String(),
        amount: Type.String(),
        wrappedAddress: Type.String(),
        nativeToken: Type.String(),
        wrappedToken: Type.String(),
      }),
    ),
  },
  { $id: 'WrapResponse' },
);
export type WrapResponseType = Static<typeof WrapResponseSchema>;

import { Type, Static } from '@sinclair/typebox';

import { TokenInfo } from '../chains/ethereum/ethereum';

import {
  NetworkSelectionRequest,
  CustomTransactionReceipt,
  CustomTransactionResponse,
} from './common-interfaces';

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
    gasPrice: Type.Number(),
    gasPriceToken: Type.String(),
    gasLimit: Type.Number(),
    gasCost: Type.Number(),
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
    txHash: Type.String({ description: 'Transaction signature/hash' }),
  },
  { $id: 'PollRequest' },
);
export type PollRequestType = Static<typeof PollRequestSchema>;

export const PollResponseSchema = Type.Object(
  {
    currentBlock: Type.Number(),
    txHash: Type.String(),
    txBlock: Type.Union([Type.Number(), Type.Null()]),
    txStatus: Type.Number(),
    txData: Type.Union([Type.Record(Type.String(), Type.Any()), Type.Null()]),
    fee: Type.Union([Type.Number(), Type.Null()]),
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
      spenderAddress: Type.String({
        description:
          'the address of the contract that will be allowed to spend tokens',
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
      spenderAddress: Type.String({
        description:
          'the address of the contract that will be allowed to spend tokens',
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
    tokenAddress: Type.String(),
    spender: Type.String(),
    amount: Type.String(),
    nonce: Type.Number(),
    txHash: Type.String(),
    approval: CustomTransactionSchema,
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
    nonce: Type.Number(),
    txHash: Type.String(),
    fee: Type.String(),
    amount: Type.String(),
    wrappedAddress: Type.String(),
    nativeToken: Type.String(),
    wrappedToken: Type.String(),
    tx: CustomTransactionSchema,
  },
  { $id: 'WrapResponse' },
);
export type WrapResponseType = Static<typeof WrapResponseSchema>;

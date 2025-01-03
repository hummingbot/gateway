import { Type, Static } from '@sinclair/typebox';
import { NetworkSelectionRequest } from '../services/common-interfaces';

// Base schemas
export const NetworkSelectionSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
});

// Request Schemas
export const NonceRequestSchema = Type.Intersect([
  NetworkSelectionSchema,
  Type.Object({
    address: Type.String({ description: "the user's public Ethereum key" }),
  }),
]);

export const NonceResponseSchema = Type.Object({
  nonce: Type.Number({ description: "the user's nonce" }),
});

export const AllowancesRequestSchema = Type.Intersect([
  NetworkSelectionSchema,
  Type.Object({
    address: Type.String({ description: "the user's public Ethereum key" }),
    spender: Type.String({ description: "the spender address for whom approvals are checked" }),
    tokenSymbols: Type.Array(Type.String(), { description: "a list of token symbols" }),
  }),
]);

export const AllowancesResponseSchema = Type.Object({
  network: Type.String(),
  timestamp: Type.Number(),
  latency: Type.Number(),
  spender: Type.String(),
  approvals: Type.Record(Type.String(), Type.String()),
});

export const ApproveRequestSchema = Type.Intersect([
  NetworkSelectionSchema,
  Type.Object({
    amount: Type.Optional(Type.String({ description: "the amount the spender will be approved to use" })),
    nonce: Type.Optional(Type.Number({ description: "the address's next nonce" })),
    maxFeePerGas: Type.Optional(Type.String()),
    maxPriorityFeePerGas: Type.Optional(Type.String()),
    address: Type.String({ description: "the user's public Ethereum key" }),
    spender: Type.String({ description: "the address of the spender" }),
    token: Type.String({ description: "the token symbol the spender will be approved for" }),
  }),
]);

export const CustomTransactionSchema = Type.Object({
  data: Type.String(),
  to: Type.String(),
  // Add other CustomTransaction properties as needed
});

export const ApproveResponseSchema = Type.Object({
  network: Type.String(),
  timestamp: Type.Number(),
  latency: Type.Number(),
  tokenAddress: Type.String(),
  spender: Type.String(),
  amount: Type.String(),
  nonce: Type.Number(),
  approval: CustomTransactionSchema,
});

export const CancelRequestSchema = Type.Intersect([
  NetworkSelectionSchema,
  Type.Object({
    nonce: Type.Number({ description: "the nonce of the transaction to be canceled" }),
    address: Type.String({ description: "the user's public Ethereum key" }),
  }),
]);

export const CancelResponseSchema = Type.Object({
  network: Type.String(),
  timestamp: Type.Number(),
  latency: Type.Number(),
  txHash: Type.Union([Type.String(), Type.Undefined()]),
});

// Type definitions using Static
export type NonceRequest = Static<typeof NonceRequestSchema>;
export type NonceResponse = Static<typeof NonceResponseSchema>;
export type AllowancesRequest = Static<typeof AllowancesRequestSchema>;
export type AllowancesResponse = Static<typeof AllowancesResponseSchema>;
export type ApproveRequest = Static<typeof ApproveRequestSchema>;
export type ApproveResponse = Static<typeof ApproveResponseSchema>;
export type CancelRequest = Static<typeof CancelRequestSchema>;
export type CancelResponse = Static<typeof CancelResponseSchema>;

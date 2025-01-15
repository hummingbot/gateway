import { Type, Static } from '@sinclair/typebox';
import { NetworkSelectionSchema } from '../services/common-interfaces';

export interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

const SideSchema = Type.Union([
  Type.Literal('BUY'),
  Type.Literal('SELL')
]);

export const PriceRequestSchema = Type.Intersect([
  NetworkSelectionSchema,
  Type.Object({
    quote: Type.String(),
    base: Type.String(),
    amount: Type.String(),
    side: SideSchema,
    allowedSlippage: Type.Optional(Type.String()),
    poolId: Type.Optional(Type.String())
  })
]);

export const PriceResponseSchema = Type.Object({
  base: Type.String(),
  quote: Type.String(),
  amount: Type.String(),
  rawAmount: Type.String(),
  expectedAmount: Type.String(),
  price: Type.String(),
  network: Type.String(),
  timestamp: Type.Number(),
  latency: Type.Number(),
  gasPrice: Type.Number(),
  gasPriceToken: Type.String(),
  gasLimit: Type.Number(),
  gasCost: Type.String(),
  gasWanted: Type.Optional(Type.String())
});

export const TradeRequestSchema = Type.Intersect([
  NetworkSelectionSchema,
  Type.Object({
    quote: Type.String(),
    base: Type.String(),
    amount: Type.String(),
    address: Type.String(),
    side: SideSchema,
    limitPrice: Type.Optional(Type.String()),
    nonce: Type.Optional(Type.Number()),
    maxFeePerGas: Type.Optional(Type.String()),
    maxPriorityFeePerGas: Type.Optional(Type.String()),
    allowedSlippage: Type.Optional(Type.String()),
    poolId: Type.Optional(Type.String())
  })
]);

export const TradeResponseSchema = Type.Object({
  network: Type.String(),
  timestamp: Type.Number(),
  latency: Type.Number(),
  base: Type.String(),
  quote: Type.String(),
  amount: Type.String(),
  rawAmount: Type.String(),
  expectedIn: Type.Optional(Type.String()),
  expectedOut: Type.Optional(Type.String()),
  price: Type.String(),
  gasPrice: Type.Number(),
  gasPriceToken: Type.String(),
  gasLimit: Type.Number(),
  gasWanted: Type.Optional(Type.String()),
  gasCost: Type.String(),
  nonce: Type.Optional(Type.Number()),
  txHash: Type.Union([Type.String(), Type.Null()])
});

export const EstimateGasResponseSchema = Type.Object({
  network: Type.String(),
  timestamp: Type.Number(),
  gasPrice: Type.Number(),
  gasPriceToken: Type.String(),
  gasLimit: Type.Number(),
  gasCost: Type.String()
});

export type Side = Static<typeof SideSchema>;
export type PriceRequest = Static<typeof PriceRequestSchema>;
export type PriceResponse = Static<typeof PriceResponseSchema>;
export type TradeRequest = Static<typeof TradeRequestSchema>;
export type TradeResponse = Static<typeof TradeResponseSchema>;
export type EstimateGasResponse = Static<typeof EstimateGasResponseSchema>;


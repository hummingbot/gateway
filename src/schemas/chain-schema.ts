import { Type, Static } from '@sinclair/typebox';

export const EstimateGasRequestSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
  gasLimit: Type.Optional(Type.Number())
}, { $id: 'EstimateGasRequest'});
export type EstimateGasRequestType = Static<typeof EstimateGasRequestSchema>;

export const EstimateGasResponseSchema = Type.Object({
    gasPrice: Type.Number(),
    gasPriceToken: Type.String(),
    gasLimit: Type.Number(),
    gasCost: Type.Number()
  }, { $id: 'EstimateGasResponse' });
export type EstimateGasResponse = Static<typeof EstimateGasResponseSchema>;

export const BalanceRequestSchema = Type.Object({
  network: Type.String(),
  address: Type.String(),
  tokenSymbols: Type.Optional(Type.Array(Type.String()))
}, { $id: 'BalanceRequest' });
export type BalanceRequestType = Static<typeof BalanceRequestSchema>;

export const BalanceResponseSchema = Type.Object({
  balances: Type.Record(Type.String(), Type.Number())
}, { $id: 'BalanceResponse' });
export type BalanceResponseType = Static<typeof BalanceResponseSchema>;

export const TokensRequestSchema = Type.Object({
  network: Type.String(),
  tokenSymbols: Type.Optional(
    Type.Union([
      Type.String(),
      Type.Array(Type.String())
    ])
  )
}, { $id: 'TokensRequest' });
export type TokensRequestType = Static<typeof TokensRequestSchema>;

export const TokensResponseSchema = Type.Object({
  tokens: Type.Array(Type.Object({
    symbol: Type.String(),
    address: Type.String(),
    decimals: Type.Number(),
    name: Type.String()
  }))
}, { $id: 'TokensResponse' });
export type TokensResponseType = Static<typeof TokensResponseSchema>;

export const PollRequestSchema = Type.Object({
  network: Type.String(),
  txHash: Type.String()
}, { $id: 'PollRequest' });
export type PollRequestType = Static<typeof PollRequestSchema>;

export const PollResponseSchema = Type.Object({
  currentBlock: Type.Number(),
  txHash: Type.String(),
  txBlock: Type.Union([Type.Number(), Type.Null()]),
  txStatus: Type.Number(),
  txData: Type.Union([
    Type.Record(Type.String(), Type.Any()),
    Type.Null()
  ]),
  fee: Type.Union([Type.Number(), Type.Null()]),
  error: Type.Optional(Type.String())
}, { $id: 'PollResponse' });
export type PollResponseType = Static<typeof PollResponseSchema>;

export const StatusRequestSchema = Type.Object({
  network: Type.String()
}, { $id: 'StatusRequest' });
export type StatusRequestType = Static<typeof StatusRequestSchema>;

export const StatusResponseSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
  rpcUrl: Type.String(),
  currentBlockNumber: Type.Number(),
  nativeCurrency: Type.String()
}, { $id: 'StatusResponse' });
export type StatusResponseType = Static<typeof StatusResponseSchema>;

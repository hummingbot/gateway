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

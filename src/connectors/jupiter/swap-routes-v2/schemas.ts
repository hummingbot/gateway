import { Type } from '@sinclair/typebox';

import {
  GetPriceRequest,
  GetQuoteRequest,
  ExecuteQuoteRequest,
  ExecuteSwapRequest,
  GetPriceResponse,
  GetQuoteResponse,
} from '../../../schemas/swap-schema';

// Jupiter-specific extensions
export const JupiterGetPriceRequest = Type.Intersect([
  GetPriceRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(
      Type.Boolean({ description: 'Only use direct routes' }),
    ),
    asLegacyTransaction: Type.Optional(
      Type.Boolean({ description: 'Use legacy transaction format' }),
    ),
  }),
]);

export const JupiterGetQuoteRequest = Type.Intersect([
  GetQuoteRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(
      Type.Boolean({ description: 'Only use direct routes' }),
    ),
    asLegacyTransaction: Type.Optional(
      Type.Boolean({ description: 'Use legacy transaction format' }),
    ),
    maxAccounts: Type.Optional(
      Type.Number({ description: 'Maximum number of accounts' }),
    ),
    priorityFeeLamports: Type.Optional(
      Type.Number({ description: 'Priority fee in lamports' }),
    ),
  }),
]);

export const JupiterExecuteQuoteRequest = Type.Intersect([
  ExecuteQuoteRequest,
  Type.Object({
    priorityFeeLamports: Type.Optional(
      Type.Number({ description: 'Priority fee in lamports' }),
    ),
    computeUnits: Type.Optional(
      Type.Number({ description: 'Compute units for transaction' }),
    ),
  }),
]);

export const JupiterExecuteSwapRequest = Type.Intersect([
  ExecuteSwapRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(
      Type.Boolean({ description: 'Only use direct routes' }),
    ),
    asLegacyTransaction: Type.Optional(
      Type.Boolean({ description: 'Use legacy transaction format' }),
    ),
    maxAccounts: Type.Optional(
      Type.Number({ description: 'Maximum number of accounts' }),
    ),
    priorityFeeLamports: Type.Optional(
      Type.Number({ description: 'Priority fee in lamports' }),
    ),
    computeUnits: Type.Optional(
      Type.Number({ description: 'Compute units for transaction' }),
    ),
  }),
]);

export const JupiterGetPriceResponse = GetPriceResponse;
export const JupiterGetQuoteResponse = GetQuoteResponse;

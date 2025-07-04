import { Type } from '@sinclair/typebox';

import {
  QuoteSwapRequest,
  ExecuteQuoteRequest,
  ExecuteSwapRequest,
  QuoteSwapResponse,
} from '../../../schemas/router-schema';

// Jupiter-specific extensions for quote-swap
export const JupiterQuoteSwapRequest = Type.Intersect([
  QuoteSwapRequest,
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

export const JupiterQuoteSwapResponse = QuoteSwapResponse;

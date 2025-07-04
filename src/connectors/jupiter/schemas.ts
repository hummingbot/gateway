import { Type } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

// Jupiter-specific extensions for quote-swap
export const JupiterQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(Type.Boolean()),
    asLegacyTransaction: Type.Optional(Type.Boolean()),
    maxAccounts: Type.Optional(Type.Number()),
    priorityFeeLamports: Type.Optional(Type.Number()),
  }),
]);

// Jupiter-specific extensions for quote-swap response
export const JupiterQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    routePlan: Type.Optional(Type.Array(Type.Any())),
    contextSlot: Type.Optional(Type.Number()),
    timeTaken: Type.Optional(Type.Number()),
  }),
]);

// Jupiter-specific extensions for execute-quote
export const JupiterExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    priorityFeeLamports: Type.Optional(Type.Number()),
    computeUnits: Type.Optional(Type.Number()),
  }),
]);

// Jupiter-specific extensions for execute-swap
export const JupiterExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(Type.Boolean()),
    asLegacyTransaction: Type.Optional(Type.Boolean()),
    maxAccounts: Type.Optional(Type.Number()),
    priorityFeeLamports: Type.Optional(Type.Number()),
    computeUnits: Type.Optional(Type.Number()),
  }),
]);

import { Type } from '@sinclair/typebox';

import * as Base from '../../schemas/swap-schema';

// Jupiter-specific extensions for get-price
export const JupiterGetPriceRequest = Type.Intersect([
  Base.GetPriceRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(Type.Boolean()),
    asLegacyTransaction: Type.Optional(Type.Boolean()),
  }),
]);

// Jupiter-specific extensions for get-quote
export const JupiterGetQuoteRequest = Type.Intersect([
  Base.GetQuoteRequest,
  Type.Object({
    onlyDirectRoutes: Type.Optional(Type.Boolean()),
    asLegacyTransaction: Type.Optional(Type.Boolean()),
    maxAccounts: Type.Optional(Type.Number()),
    priorityFeeLamports: Type.Optional(Type.Number()),
  }),
]);

// Jupiter-specific extensions for get-quote response
export const JupiterGetQuoteResponse = Type.Intersect([
  Base.GetQuoteResponse,
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

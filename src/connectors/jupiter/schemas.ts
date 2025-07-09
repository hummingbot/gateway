import { Type } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

// Jupiter-specific extensions for quote-swap
export const JupiterQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    restrictIntermediateTokens: Type.Optional(
      Type.Boolean({
        description:
          'Restrict routing through highly liquid intermediate tokens only for better price and stability',
      }),
    ),
    onlyDirectRoutes: Type.Optional(
      Type.Boolean({
        description: 'Restrict routing to only go through 1 market',
      }),
    ),
  }),
]);

// Jupiter-specific extensions for quote-swap response
export const JupiterQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    quoteResponse: Type.Object({
      inputMint: Type.String(),
      inAmount: Type.String(),
      outputMint: Type.String(),
      outAmount: Type.String(),
      otherAmountThreshold: Type.String(),
      swapMode: Type.String(),
      slippageBps: Type.Number(),
      platformFee: Type.Optional(Type.Any()),
      priceImpactPct: Type.String(),
      routePlan: Type.Array(Type.Any()),
      contextSlot: Type.Optional(Type.Number()),
      timeTaken: Type.Optional(Type.Number()),
    }),
  }),
]);

// Jupiter-specific extensions for execute-quote
export const JupiterExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    priorityLevel: Type.Optional(
      Type.String({
        description: 'Priority level for transaction processing',
        enum: ['medium', 'high', 'veryHigh'],
      }),
    ),
    maxLamports: Type.Optional(
      Type.Number({
        description: 'Maximum priority fee in lamports',
      }),
    ),
  }),
]);

// Jupiter-specific extensions for execute-swap
export const JupiterExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    restrictIntermediateTokens: Type.Optional(
      Type.Boolean({
        description:
          'Restrict routing through highly liquid intermediate tokens only for better price and stability',
      }),
    ),
    onlyDirectRoutes: Type.Optional(
      Type.Boolean({
        description: 'Restrict routing to only go through 1 market',
      }),
    ),
    priorityLevel: Type.Optional(
      Type.String({
        description: 'Priority level for transaction processing',
        enum: ['medium', 'high', 'veryHigh'],
      }),
    ),
    maxLamports: Type.Optional(
      Type.Number({
        description: 'Maximum priority fee in lamports',
      }),
    ),
  }),
]);

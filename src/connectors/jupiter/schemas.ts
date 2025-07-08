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
    priceImpactPct: Type.Number({
      description: 'Estimated price impact as a percentage (0-100)',
    }),
    gasEstimate: Type.String({ description: 'Estimated gas for transaction' }),
    expirationTime: Type.Number({ description: 'Quote expiration timestamp' }),
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
    priorityFeeLamports: Type.Optional(Type.Number()),
    computeUnits: Type.Optional(Type.Number()),
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
    priorityFeeLamports: Type.Optional(Type.Number()),
    computeUnits: Type.Optional(Type.Number()),
  }),
]);

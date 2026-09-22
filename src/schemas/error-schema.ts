import { Type } from '@sinclair/typebox';

import { ErrorCode } from '../services/error-handler';

/**
 * The envelope every failed request answers with.
 *
 * Gateway has always returned this shape and never described it: of 56 operations, three
 * declared any non-2xx response, so a generated client had models for success and nothing
 * for failure — while `code` is precisely the field callers are supposed to branch on
 * (`TRANSACTION_TIMEOUT` is retryable, `SLIPPAGE_EXCEEDED` is not).
 *
 * Attached to every operation by the swagger transform in `src/app.ts` rather than route
 * by route, because it is the same envelope everywhere and a per-route list would drift.
 */
export const ErrorResponse = Type.Object(
  {
    statusCode: Type.Integer({ description: 'HTTP status code', examples: [400] }),
    error: Type.String({ description: 'HTTP status name', examples: ['Bad Request'] }),
    message: Type.String({
      description: 'What went wrong, in terms of the request that caused it',
      examples: ["Connector 'meteora' runs on solana, not ethereum"],
    }),
    code: Type.Optional(
      Type.String({
        description:
          'Machine-readable cause, present when Gateway can name one. This is what a caller ' +
          'branches on: TRANSACTION_TIMEOUT and RATE_LIMITED are retryable, the rest are not.',
        enum: Object.values(ErrorCode),
      }),
    ),
  },
  { $id: 'ErrorResponse' },
);

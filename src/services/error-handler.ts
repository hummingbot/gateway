// Error codes for specific error types
// Retryable: TRANSACTION_TIMEOUT (tx submitted but confirmation timed out)
// Non-retryable: all others (simulation failed, invalid params, etc.)
// Special: NO_ROUTE_FOUND (can retry with flipped direction - ExactIn instead of ExactOut)
export const ErrorCode = {
  TRANSACTION_TIMEOUT: 'TRANSACTION_TIMEOUT', // Retryable - tx may have succeeded
  SIMULATION_FAILED: 'SIMULATION_FAILED', // Non-retryable - tx would fail on-chain
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE', // Non-retryable - not enough funds
  INVALID_PARAMS: 'INVALID_PARAMS', // Non-retryable - bad request params
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED', // Non-retryable - price moved too much
  NO_ROUTE_FOUND: 'NO_ROUTE_FOUND', // Can retry with flipped direction (ExactIn vs ExactOut)
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Custom HTTP error class for use throughout the application.
 * These errors carry a statusCode that Fastify's error handler will properly handle.
 */
export class HttpError extends Error {
  statusCode: number;
  error: string;
  code?: ErrorCodeType;

  constructor(statusCode: number, message: string, code?: ErrorCodeType) {
    super(message);
    this.statusCode = statusCode;
    this.error = HttpError.getErrorName(statusCode);
    this.name = 'HttpError';
    this.code = code;
  }

  private static getErrorName(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      case 429:
        return 'Too Many Requests';
      case 500:
        return 'Internal Server Error';
      case 502:
        return 'Bad Gateway';
      case 503:
        return 'Service Unavailable';
      default:
        return 'Error';
    }
  }
}

/**
 * Helper functions to create HTTP errors - can be used anywhere without fastify instance
 */
export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

export function internalServerError(message: string): HttpError {
  return new HttpError(500, message);
}

export function serviceUnavailable(message: string): HttpError {
  return new HttpError(503, message);
}

export function forbidden(message: string): HttpError {
  return new HttpError(403, message);
}

export function transactionTimeout(message: string): HttpError {
  return new HttpError(504, message, ErrorCode.TRANSACTION_TIMEOUT);
}

export function simulationFailed(message: string): HttpError {
  return new HttpError(400, message, ErrorCode.SIMULATION_FAILED);
}

export function insufficientBalance(message: string): HttpError {
  return new HttpError(400, message, ErrorCode.INSUFFICIENT_BALANCE);
}

export function slippageExceeded(message: string): HttpError {
  return new HttpError(400, message, ErrorCode.SLIPPAGE_EXCEEDED);
}

export function noRouteFound(message: string): HttpError {
  return new HttpError(400, message, ErrorCode.NO_ROUTE_FOUND);
}

/**
 * HTTP errors object - drop-in replacement for fastify.httpErrors
 */
export const httpErrors = {
  badRequest,
  notFound,
  internalServerError,
  serviceUnavailable,
  forbidden,
  transactionTimeout,
  simulationFailed,
  insufficientBalance,
  slippageExceeded,
  noRouteFound,
  createError: (statusCode: number, message: string) => new HttpError(statusCode, message),
};

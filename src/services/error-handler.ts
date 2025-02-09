import { Request, RequestHandler, Response, NextFunction } from 'express';
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
// import { logger } from './logger';

// error origination from ethers library when interracting with node
export interface NodeError extends Error {
  code: string | number;
  reason?: string;
  data?: any;
}

// custom error for http exceptions
export class HttpException extends Error {
  status: number;
  message: string;
  errorCode: number;
  constructor(status: number, message: string, errorCode: number = -1) {
    super(message);
    this.status = status;
    this.message = message;
    this.errorCode = errorCode;
  }
}

export class InitializationError extends Error {
  message: string;
  errorCode: number;
  constructor(message: string, errorCode: number) {
    super(message);
    this.message = message;
    this.errorCode = errorCode;
  }
}

export class UniswapishPriceError extends Error {
  message: string;
  constructor(message: string) {
    super(message);
    this.message = message;
  }
}

export class InvalidNonceError extends Error {
  message: string;
  errorCode: number;
  constructor(message: string, errorCode: number) {
    super(message);
    this.message = message;
    this.errorCode = errorCode;
  }
}

// Capture errors from an async route, this must wrap any route that uses async.
// For example, `app.get('/', asyncHandler(async (req, res) -> {...}))`
export const asyncHandler =
  (fn: RequestHandler) => (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };

export interface TransactionError {
  errorCode: number;
  message: string;
}

export const parseTransactionGasError = (
  error: any
): TransactionError | null => {
  if ('code' in error && error.code === 'SERVER_ERROR') {
    if ('body' in error) {
      const innerError = JSON.parse(error['body']);

      if (
        'error' in innerError &&
        'code' in innerError['error'] &&
        innerError['error']['code'] === -32010 &&
        'message' in innerError['error']
      ) {
        const transactionError: TransactionError = {
          errorCode: TRANSACTION_GAS_PRICE_TOO_LOW,
          message: innerError['error']['message'],
        };

        return transactionError;
      }
    }
  }
  return null;
};

export const NETWORK_ERROR_CODE = 1001;
export const RATE_LIMIT_ERROR_CODE = 1002;
export const OUT_OF_GAS_ERROR_CODE = 1003;
export const TRANSACTION_GAS_PRICE_TOO_LOW = 1004;
export const LOAD_WALLET_ERROR_CODE = 1005;
export const TOKEN_NOT_SUPPORTED_ERROR_CODE = 1006;
export const TRADE_FAILED_ERROR_CODE = 1007;
export const SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE = 1008;
export const SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE = 1009;
export const SERVICE_UNITIALIZED_ERROR_CODE = 1010;
export const UNKNOWN_CHAIN_ERROR_CODE = 1011;
export const INVALID_NONCE_ERROR_CODE = 1012;
export const PRICE_FAILED_ERROR_CODE = 1013;
export const INCOMPLETE_REQUEST_PARAM_CODE = 1014;
export const ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_CODE = 1015;
export const ACCOUNT_NOT_SPECIFIED_CODE = 1016;
export const TRADE_NOT_FOUND_ERROR_CODE = 1017;
export const UNKNOWN_ERROR_ERROR_CODE = 1099;
export const AMOUNT_NOT_SUPPORTED_ERROR_CODE = 1016;
export const ENDPOINT_NOT_SUPPORTED_ERROR_CODE = 1018;
export const INSUFFICIENT_FUNDS_ERROR_CODE = 1019;
export const GAS_LIMIT_EXCEEDED_ERROR_CODE = 1020;
export const AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE = 1021;
export const INSUFFICIENT_BASE_TOKEN_BALANCE_ERROR_CODE = 1022;
export const INSUFFICIENT_QUOTE_TOKEN_BALANCE_ERROR_CODE = 1023;
export const SIMULATION_ERROR_CODE = 1024;
export const SWAP_ROUTE_FETCH_ERROR_CODE = 1025;

export const NETWORK_ERROR_MESSAGE =
  'Network error. Please check your node URL, API key, and Internet connection.';
export const RATE_LIMIT_ERROR_MESSAGE =
  'Blockchain node API rate limit exceeded.';
export const OUT_OF_GAS_ERROR_MESSAGE = 'Transaction out of gas.';
export const LOAD_WALLET_ERROR_MESSAGE = 'Failed to load wallet: ';
export const TOKEN_NOT_SUPPORTED_ERROR_MESSAGE = 'Token not supported: ';
export const TRADE_FAILED_ERROR_MESSAGE = 'Trade query failed: ';
export const INCOMPLETE_REQUEST_PARAM = 'Incomplete request parameters.';
export const INVALID_NONCE_ERROR_MESSAGE = 'Invalid Nonce provided: ';
export const AMOUNT_NOT_SUPPORTED_ERROR_MESSAGE =
  'Amount provided in an unexpected format';
export const ENDPOINT_NOT_SUPPORTED_ERROR_MESSAGE = 'Endpoint not supported by this chain/controller.';
export const INSUFFICIENT_FUNDS_ERROR_MESSAGE = 'Insufficient funds for transaction.'
export const GAS_LIMIT_EXCEEDED_ERROR_MESSAGE = 'Gas limit exceeded (gasWanted greater than gasLimitEstimate).';
export const AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE = 'Calculated amount less than min amount provided with slippage. Maybe try increasing slippage. ';
export const INSUFFICIENT_BASE_TOKEN_BALANCE_ERROR_MESSAGE = 'Insufficient base token balance to perform trade.';
export const INSUFFICIENT_QUOTE_TOKEN_BALANCE_ERROR_MESSAGE = 'Insufficient quote token balance to perform trade.';
export const SIMULATION_ERROR_MESSAGE = 'Transaction simulation failed: ';
export const SWAP_ROUTE_FETCH_ERROR_MESSAGE = 'Failed to fetch swap route: ';

export const SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE = (
  price: any,
  limitPrice: any
) => `Swap price ${price} exceeds limitPrice ${limitPrice}`;

export const SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE = (
  price: any,
  limitPrice: any
) => `Swap price ${price} lower than limitPrice ${limitPrice}`;

export const SERVICE_UNITIALIZED_ERROR_MESSAGE = (service: any) =>
  `${service} was called before being initialized.`;

export const UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE = (chainName: any) =>
  `Unrecognized chain name ${chainName}.`;

export const ERROR_RETRIEVING_WALLET_ADDRESS_ERROR_MESSAGE = (
  privKey: string
) =>
  `Unable to retrieve wallet address for provided private key: ${privKey.substring(
    0,
    5
  )}`;

export const UNKNOWN_ERROR_MESSAGE = 'Unknown error.';

export const PRICE_FAILED_ERROR_MESSAGE = 'Price query failed: ';

export const TRADE_NOT_FOUND_ERROR_MESSAGE = 'Trade not found.';

export interface ErrorResponse {
  stack?: any;
  message: string;
  httpErrorCode: number;
  errorCode: number;
}

export const gatewayErrorMiddleware = (
  err: Error | NodeError | HttpException | InitializationError
): ErrorResponse => {
  const response: ErrorResponse = {
    message: err.message || UNKNOWN_ERROR_MESSAGE,
    httpErrorCode: 503,
    errorCode: UNKNOWN_ERROR_ERROR_CODE,
    stack: err.stack,
  };
  // the default http error code is 503 for an unknown error
  if (err instanceof HttpException) {
    response.httpErrorCode = err.status;
    response.errorCode = err.errorCode;
  } else if (err instanceof InitializationError) {
    response.errorCode = err.errorCode;
  } else {
    response.errorCode = UNKNOWN_ERROR_ERROR_CODE;
    response.message = UNKNOWN_ERROR_MESSAGE;

    if ('code' in err) {
      switch (typeof err.code) {
        case 'string':
          // error is from ethers library
          if (['NETWORK_ERROR', 'TIMEOUT'].includes(err.code)) {
            response.errorCode = NETWORK_ERROR_CODE;
            response.message = NETWORK_ERROR_MESSAGE;
          } else if (err.code === 'SERVER_ERROR') {
            const transactionError = parseTransactionGasError(err);
            if (transactionError) {
              response.errorCode = transactionError.errorCode;
              response.message = transactionError.message;
            } else {
              response.errorCode = NETWORK_ERROR_CODE;
              response.message = NETWORK_ERROR_MESSAGE;
            }
          }
          break;

        case 'number':
          // errors from provider, this code comes from infura
          if (err.code === -32005) {
            // we only handle rate-limit errors
            response.errorCode = RATE_LIMIT_ERROR_CODE;
            response.message = RATE_LIMIT_ERROR_MESSAGE;
          } else if (err.code === -32010) {
            response.errorCode = TRANSACTION_GAS_PRICE_TOO_LOW;
            response.message = err.message;
          }
          break;
      }
    }
  }
  return response;
};

// Simplified HttpError class
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }

  toJSON() {
    return {
      statusCode: this.statusCode,
      error: this.name,
      message: this.message
    };
  }
}

// Global error handler
export const errorHandler = (
  error: FastifyError | HttpError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Handle validation errors
  if ('validation' in error && error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: error.message,
      validation: error.validation
    });
  }

  // Handle our HttpErrors
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send(error);
  }

  // Handle Fastify's native errors
  if (error.statusCode && error.statusCode >= 400) {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.name,
      message: error.message
    });
  }

  // Log and handle unexpected errors
  console.log('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    params: request.params
  });

  reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
};

// Helper functions for common errors
export const httpNotFound = (message: string) => new HttpError(404, message);
export const httpBadRequest = (message: string) => new HttpError(400, message);
export const httpInternalServerError = (message: string = 'Internal Server Error') =>
  new HttpError(500, message);
export const httpUnauthorized = (message: string = 'Unauthorized') =>
  new HttpError(401, message);
export const httpForbidden = (message: string = 'Forbidden') =>
  new HttpError(403, message);

export const ERROR_MESSAGES = {
  POOL_NOT_FOUND: (poolAddress: string) => `Pool not found: ${poolAddress}`,
  MISSING_AMOUNTS: 'Must provide either baseTokenAmount or quoteTokenAmount',
  INSUFFICIENT_BALANCE: (token: string, required: number, available: number) =>
    `Insufficient ${token} balance. Required: ${required}, Available: ${available}`,
  INVALID_PRICE_RANGE: 'Upper price must be greater than lower price',
  MAX_BIN_WIDTH_EXCEEDED: (current: number, max: number) =>
    `Position width (${current} bins) exceeds ${max} bins limit`,
  TRANSACTION_FAILED: (reason: string) => `Transaction failed: ${reason}`,
  POSITION_CREATION_FAILED: 'Failed to create position',
  INVALID_SOLANA_ADDRESS: (address: string) => 
    `Invalid Solana address: ${address}. Address must be a base58-encoded public key`,
  OPEN_POSITION_ERROR: (message: string) => `Open position error: ${message}`,
  TOKEN_NOT_FOUND: (token: string) => `Token not found: ${token}`,
};

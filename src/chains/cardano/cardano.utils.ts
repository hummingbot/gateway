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

export const NETWORK_ERROR_MESSAGE =
  'Network error. Please check your node URL, API key, and Internet connection.';
export const RATE_LIMIT_ERROR_MESSAGE =
  'Blockchain node API rate limit exceeded.';
export const LOAD_WALLET_ERROR_MESSAGE = 'Failed to load wallet: ';
export const TOKEN_NOT_SUPPORTED_ERROR_MESSAGE = 'Token not supported: ';
export const TRADE_FAILED_ERROR_MESSAGE = 'Trade query failed: ';
export const INCOMPLETE_REQUEST_PARAM = 'Incomplete request parameters.';
export const INVALID_NONCE_ERROR_MESSAGE = 'Invalid Nonce provided: ';
export const AMOUNT_NOT_SUPPORTED_ERROR_MESSAGE =
  'Amount provided in an unexpected format';
export const ENDPOINT_NOT_SUPPORTED_ERROR_MESSAGE =
  'Endpoint not supported by this chain/controller.';
export const INSUFFICIENT_FUNDS_ERROR_MESSAGE =
  'Insufficient funds for transaction.';
export const GAS_LIMIT_EXCEEDED_ERROR_MESSAGE =
  'Gas limit exceeded (gasWanted greater than gasLimitEstimate).';
export const AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE =
  'Calculated amount less than min amount provided with slippage. Maybe try increasing slippage. ';

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

export interface TransactionStatus {
  txHash: string;
  block: number | null;
  blockHeight: number | null;
  blockTime: number | null;
  fees: number;
  validContract: boolean;
  status: 0 | 1; // 0 = pending, 1 = confirmed
}

export interface CardanoTokensResponseType {}

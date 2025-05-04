import {
  isFloatString,
  isFractionString,
  mkValidator,
  mkRequestValidator,
  RequestValidator,
  Validator,
} from '../services/validators';

import {
  isAddress as isEthereumAddress,
} from '../chains/ethereum/ethereum.utils';

import { FeeAmount } from '@uniswap/v3-sdk';

export const invalidConnectorError: string =
  'The connector param is not a string.';

export const invalidQuoteError: string = 'The quote param is not a string.';

export const invalidBaseError: string = 'The base param is not a string.';

export const invalidTokenError: string =
  'One of the token params is not a string.';

export const invalidAmountError: string =
  'The amount param must be a string of a non-negative integer.';

export const invalidSideError: string =
  'The side param must be a string of "BUY" or "SELL".';

// Error messages that were previously imported from ethereum.utils
export const invalidAddressError: string = 'The address param is not a valid Ethereum address.';
export const invalidChainError: string = 'The chain param is not a string.';
export const invalidNetworkError: string = 'The network param is not a string.';
export const invalidNonceError: string = 'If nonce is included it must be a non-negative integer.';
export const invalidMaxFeePerGasError: string = 'If maxFeePerGas is included it must be a string of a float.';
export const invalidMaxPriorityFeePerGasError: string = 'If maxPriorityFeePerGas is included it must be a string of a float.';

export const invalidFeeTier: string = 'Incorrect fee tier';

export const invalidLimitPriceError: string =
  'The limitPrice param may be null or a string of a float or integer number.';

export const invalidLPPriceError: string =
  'One of the LP prices may be null or a string of a float or integer number.';

export const invalidTokenIdError: string =
  'If tokenId is included it must be a non-negative integer.';

export const invalidTimeError: string =
  'Period or interval has to be a non-negative integer.';

export const invalidDecreasePercentError: string =
  'If decreasePercent is included it must be a non-negative integer.';

export const invalidAllowedSlippageError: string =
  'The allowedSlippage param may be null or a string of a fraction.';

export const invalidPoolIdError: string =
  'PoolId(if supplied) must be a string.';

export const validateConnector: Validator = mkValidator(
  'connector',
  invalidConnectorError,
  (val) => typeof val === 'string'
);

// given a request, look for a key called address that is an Ethereum or Cosmos wallet
export const validateAddress: Validator = mkValidator(
  'address',
  invalidAddressError,
  (val) => typeof val === 'string' && (isEthereumAddress(val))
);

export const validateQuote: Validator = mkValidator(
  'quote',
  invalidQuoteError,
  (val) => typeof val === 'string'
);

export const validateBase: Validator = mkValidator(
  'base',
  invalidBaseError,
  (val) => typeof val === 'string'
);

export const validateToken0: Validator = mkValidator(
  'token0',
  invalidTokenError,
  (val) => typeof val === 'string'
);

export const validateToken1: Validator = mkValidator(
  'token1',
  invalidTokenError,
  (val) => typeof val === 'string'
);

export const validateAmount: Validator = mkValidator(
  'amount',
  invalidAmountError,
  (val) => typeof val === 'string' && isFloatString(val)
);

export const validateAmount0: Validator = mkValidator(
  'amount0',
  invalidAmountError,
  (val) => typeof val === 'string'
);

export const validateAmount1: Validator = mkValidator(
  'amount1',
  invalidAmountError,
  (val) => typeof val === 'string'
);

export const validateSide: Validator = mkValidator(
  'side',
  invalidSideError,
  (val) => typeof val === 'string' && (val === 'BUY' || val === 'SELL')
);

export const validateFee: Validator = mkValidator(
  'fee',
  invalidFeeTier,
  (val) =>
  typeof val === 'string' && Object.keys(FeeAmount).includes(val.toUpperCase())
);

export const validateLowerPrice: Validator = mkValidator(
  'lowerPrice',
  invalidLPPriceError,
  (val) => typeof val === 'string' && isFloatString(val),
  true
);

export const validateUpperPrice: Validator = mkValidator(
  'upperPrice',
  invalidLPPriceError,
  (val) => typeof val === 'string' && isFloatString(val),
  true
);

export const validateLimitPrice: Validator = mkValidator(
  'limitPrice',
  invalidLimitPriceError,
  (val) => typeof val === 'string' && isFloatString(val),
  true
);

export const validateTokenId: Validator = mkValidator(
  'tokenId',
  invalidTokenIdError,
  (val) => typeof val === 'number' && val >= 0 && Number.isInteger(val),
  true
);

export const validatePeriod: Validator = mkValidator(
  'period',
  invalidTimeError,
  (val) => typeof val === 'number' && val >= 0 && Number.isInteger(val),
  true
);

export const validateInterval: Validator = mkValidator(
  'interval',
  invalidTimeError,
  (val) => typeof val === 'number' && val >= 0 && Number.isInteger(val),
  true
);

export const validateDecreasePercent: Validator = mkValidator(
  'decreasePercent',
  invalidDecreasePercentError,
  (val) =>
    typeof val === 'undefined' ||
    (typeof val === 'number' && val >= 0 && Number.isFinite(val)),
  true
);

export const validateAllowedSlippage: Validator = mkValidator(
  'allowedSlippage',
  invalidAllowedSlippageError,
  (val) => typeof val === 'string' && (isFractionString(val) || val.includes('%')),
  true
);

export const validatePoolId: Validator = mkValidator(
  'poolId',
  invalidPoolIdError,
  (val) => typeof val === 'string' && val.length !== 0,
  true
);

// Define the validators that were previously imported
export const validateChain: Validator = mkValidator(
  'chain',
  invalidChainError,
  (val) => typeof val === 'string'
);

export const validateNetwork: Validator = mkValidator(
  'network',
  invalidNetworkError,
  (val) => typeof val === 'string'
);

export const validateNonce: Validator = mkValidator(
  'nonce',
  invalidNonceError,
  (val) => typeof val === 'number' && val >= 0 && Number.isInteger(val),
  true
);

export const validateMaxFeePerGas: Validator = mkValidator(
  'maxFeePerGas',
  invalidMaxFeePerGasError,
  (val) => typeof val === 'string' && isFloatString(val),
  true
);

export const validateMaxPriorityFeePerGas: Validator = mkValidator(
  'maxPriorityFeePerGas',
  invalidMaxPriorityFeePerGasError,
  (val) => typeof val === 'string' && isFloatString(val),
  true
);

export const validatePriceRequest: RequestValidator = mkRequestValidator([
  validateConnector,
  validateChain,
  validateNetwork,
  validateQuote,
  validateBase,
  validateAmount,
  validateSide,
  validateAllowedSlippage,
  validatePoolId,
]);

export const validateTradeRequest: RequestValidator = mkRequestValidator([
  validateConnector,
  validateChain,
  validateNetwork,
  validateQuote,
  validateBase,
  validateAmount,
  validateSide,
  validateLimitPrice,
  validateNonce,
  validateMaxFeePerGas,
  validateMaxPriorityFeePerGas,
  validateAllowedSlippage,
  validatePoolId,
]);

export const validateEstimateGasRequest: RequestValidator = mkRequestValidator([
  validateConnector,
  validateChain,
  validateNetwork,
]);

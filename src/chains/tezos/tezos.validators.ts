import { validateAddress, validateOperation, ValidationResult } from '@taquito/utils';
import {
  validateTokenSymbols,
  mkValidator,
  mkRequestValidator,
  RequestValidator,
  Validator,
  validateToken,
  validateAmount,
} from '../../services/validators';

// invalid parameter errors

export const invalidAddressError: string =
  'The address param is not a valid Tezos address.';

export const invalidSpenderError: string =
  'The spender param is not a valid Tezos address.';

export const invalidNonceError: string =
  'If nonce is included it must be a non-negative integer.';

export const invalidTxHashError: string =
  'The txHash param is not a valid Tezos transaction hash.';

export const invalidMaxFeePerGasError: string =
  'If maxFeePerGas is included it must be a string of a non-negative integer.';

export const invalidMaxPriorityFeePerGasError: string =
  'If maxPriorityFeePerGas is included it must be a string of a non-negative integer.';

export const invalidChainError: string = 'The chain param is not a string.';

export const invalidNetworkError: string = 'The network param is not a string.';

// test if a string matches the shape of an Tezos address
export const isAddress = (str: string): boolean => {
  return validateAddress(str) === ValidationResult.VALID;
};

// test if a string matches the shape of an Tezos transaction hash
export const isTxHash = (str: string): boolean => {
  return validateOperation(str) === ValidationResult.VALID;
};

// given a request, look for a key called address that is an Tezos wallet
export const validateTezosAddress: Validator = mkValidator(
  'address',
  invalidAddressError,
  (val) => typeof val === 'string' && isAddress(val)
);

// given a request, look for a key called spender that is a Tezos address
export const validateTezosSpender: Validator = mkValidator(
  'spender',
  invalidSpenderError,
  (val) =>
    typeof val === 'string' && isAddress(val)
);

// test if a nonce is a non-negative integer
export const validateTezosNonce: Validator = mkValidator(
  'nonce',
  invalidNonceError,
  (val) =>
    typeof val === 'undefined' ||
    (typeof val === 'number' && val >= 0 && Number.isInteger(val)),
  true
);

// test if a transaction has is a valid Tezos transaction hash
export const validateTezosTxHash: Validator = mkValidator(
  'txHash',
  invalidTxHashError,
  (val) => typeof val === 'string' && isTxHash(val)
);

// test if chain is a string
export const validateTezosChain: Validator = mkValidator(
  'chain',
  invalidChainError,
  (val) => typeof val === 'string'
);

// test if network is a string
export const validateTezosNetwork: Validator = mkValidator(
  'network',
  invalidNetworkError,
  (val) => typeof val === 'string'
);

// request types and corresponding validators
export const validateTezosNonceRequest: RequestValidator = mkRequestValidator([
  validateTezosAddress,
]);

export const validateTezosPollRequest: RequestValidator = mkRequestValidator([
  validateTezosTxHash,
  validateTezosNetwork,
  validateTezosChain,
]);

export const validateTezosBalanceRequest: RequestValidator = mkRequestValidator([
  validateTezosAddress,
  validateTokenSymbols,
]);

export const validateTezosTokenRequest: RequestValidator = mkRequestValidator([
  validateTezosChain,
  validateTokenSymbols,
  validateTezosNetwork
]);

export const validateTezosAllowancesRequest: RequestValidator = mkRequestValidator([
  validateTezosAddress,
  validateTezosSpender,
  validateTokenSymbols,
]);

export const validateTezosApproveRequest: RequestValidator = mkRequestValidator([
  validateTezosAddress,
  validateTezosSpender,
  validateToken,
  validateAmount,
  validateTezosNonce,
]);
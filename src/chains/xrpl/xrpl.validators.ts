import {
  validateTokenSymbols,
  mkValidator,
  mkRequestValidator,
  RequestValidator,
  Validator,
  isBase58,
  validateTxHash,
} from '../../services/validators';

// invalid parameter errors
export const invalidXRPLAddressError: string =
  'The spender param is not a valid XRPL address (20 bytes, base 58 encoded).';

export const invalidXRPLPrivateKeyError: string =
  'The privateKey param is not a valid XRPL seed key (16 bytes, base 58 encoded).';

// test if a string matches the shape of an XRPL address
export const isXRPLAddress = (str: string): boolean => {
  return isBase58(str) && str.length <= 35 && str.charAt(0) == 'r';
};

// test if a string matches the shape of an XRPL seed key
export const isXRPLSeedKey = (str: string): boolean => {
  return isBase58(str) && str.charAt(0) == 's';
};

// given a request, look for a key called address that is an Solana address
export const validateXRPLAddress: Validator = mkValidator(
  'address',
  invalidXRPLAddressError,
  (val) => typeof val === 'string' && isXRPLAddress(val)
);

// request types and corresponding validators

export const validateXRPLBalanceRequest: RequestValidator = mkRequestValidator([
  validateXRPLAddress,
]);

export const validateXRPLPollRequest: RequestValidator = mkRequestValidator([
  validateTxHash,
]);

export const validateXRPLGetTokenRequest: RequestValidator = mkRequestValidator(
  [validateTokenSymbols, validateXRPLAddress]
);

import {
  validateTokenSymbols,
  mkValidator,
  mkRequestValidator,
  RequestValidator,
  Validator,
  validateTxHash,
} from '../../services/validators';
import { normalizeBech32 } from '@cosmjs/encoding';
// const { fromHex } = require('@cosmjs/encoding');

export const invalidCosmosAddressError: string =
  'The spender param is not a valid Cosmos address. (Bech32 format)';
// export const invalidCosmosPrivateKeyError: string =
  // 'The privateKey param is not a valid Cosmos private key.';

export const isValidCosmosAddress = (str: string): boolean => {
  try {
    normalizeBech32(str);

    return true;
  } catch (e) {
    return false;
  }
};
// export const isValidCosmosPrivateKey = (str: string): boolean => {
//   try {
//     fromHex(str);

//     return true;
//   } catch (e) {
//     return false;
//   }
// };

// given a request, look for a key called address that is a Cosmos address
export const validatePublicKey: Validator = mkValidator(
  'address',
  invalidCosmosAddressError,
  (val) => typeof val === 'string' && isValidCosmosAddress(val)
);

export const validateCosmosBalanceRequest: RequestValidator =
  mkRequestValidator([validatePublicKey, validateTokenSymbols]);

export const validateCosmosPollRequest: RequestValidator = mkRequestValidator([
  validateTxHash,
]);

// export const validatePrivateKey: Validator = mkValidator(
//   'privateKey',
//   invalidCosmosPrivateKeyError,
//   (val) => typeof val === 'string' && isValidCosmosPrivateKey(val)
// );
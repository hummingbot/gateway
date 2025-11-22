import { normalizeBech32, fromHex } from '@cosmjs/encoding';

import { logger } from '../../services/logger';

export const invalidAmountError: string = 'If amount is included it must be a string of a non-negative integer.';

export const invalidTokenError: string = 'The token param should be a string.';

export const invalidTxHashError: string = 'The txHash param must be a string.';

export const invalidTokenSymbolsError: string = 'The tokenSymbols param should be an array of strings.';

export const isNaturalNumberString = (str: string): boolean => {
  return /^[0-9]+$/.test(str);
};

export const isIntegerString = (str: string): boolean => {
  return /^[+-]?[0-9]+$/.test(str);
};

export const isFloatString = (str: string): boolean => {
  if (isIntegerString(str)) {
    return true;
  }
  const decimalSplit = str.split('.');
  if (decimalSplit.length === 2) {
    return isIntegerString(decimalSplit[0]) && isNaturalNumberString(decimalSplit[1]);
  }
  return false;
};

export const isFractionString = (str: string): boolean => {
  const fractionSplit = str.split('/');
  if (fractionSplit.length == 2) {
    return isIntegerString(fractionSplit[0]) && isIntegerString(fractionSplit[1]);
  }
  return false;
};

export const invalidCosmosAddressError: string = 'The spender param is not a valid Cosmos address. (Bech32 format)';
export const invalidCosmosPrivateKeyError: string = 'The privateKey param is not a valid Cosmos private key.';

export const isValidCosmosAddress = (str: string): string => {
  normalizeBech32(str);
  return str;
};
export const isValidCosmosPrivateKey = (str: string): boolean => {
  try {
    fromHex(str);
    return true;
  } catch (e) {
    return false;
  }
};

export const isBase58 = (value: string): boolean => /^[A-HJ-NP-Za-km-z1-9]*$/.test(value);

// throw an error because the request parameter is malformed, collect all the
// errors related to the request to give the most information possible
export const throwIfErrorsExist = (errors: Array<string>): void => {
  if (errors.length > 0) {
    logger.error(errors.join(', '));
    // throw new HttpException(404, errors.join(', '));
  }
};

export const missingParameter = (key: string): string => {
  return `The request is missing the key: ${key}`;
};

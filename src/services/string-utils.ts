/**
 * String utility functions
 */

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
    return (
      isIntegerString(decimalSplit[0]) && isNaturalNumberString(decimalSplit[1])
    );
  }
  return false;
};

export const isFractionString = (str: string): boolean => {
  const fractionSplit = str.split('/');
  if (fractionSplit.length == 2) {
    return (
      isIntegerString(fractionSplit[0]) && isIntegerString(fractionSplit[1])
    );
  }
  return false;
};

export const isBase58 = (value: string): boolean =>
  /^[A-HJ-NP-Za-km-z1-9]*$/.test(value);
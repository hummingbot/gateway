import { BigNumber } from 'ethers';
import { format, fraction, number } from 'mathjs';
import { isFractionString, isFloatString } from './validators';

// the type of information source for tokens
export type TokenListType = 'FILE' | 'URL';

// the type of information source for markets
export type MarketListType = 'FILE' | 'URL';

// represent a token any chain, it may require some work arounds
export interface TokenInfo {
  address: string;
  chainId: number; // not all chains have chainId as a number, if it does not, come up with an internal number system.
  decimals: number;
  denom?: string; // this is a concept for injective, if it does not exist in a chain, set it to be the same as address or ignore it.
  name: string;
  symbol: string;
}

// insert a string into another string at an index
const stringInsert = (str: string, val: string, index: number) => {
  if (index > 0) {
    return str.substring(0, index) + val + str.substr(index);
  }

  return val + str;
};

// counts decimal places of a value
export const countDecimals = (value: number): number => {
  if (value >= 1 || value <= 0) {
    throw new RangeError(
      'countDecimals() is only valid for values between (0, 1).'
    );
  } else {
    return Number(value.toExponential().split('-')[1]);
  }
};

// convert a BigNumber and the number of decimals into a numeric string.
// this makes it JavaScript compatible while preserving all the data.
export const bigNumberWithDecimalToStr = (n: BigNumber, d: number): string => {
  const n_ = n.toString();

  let zeros = '';

  if (n_.length <= d) {
    zeros = '0'.repeat(d - n_.length + 1);
  }

  return stringInsert(n_.split('').reverse().join('') + zeros, '.', d)
    .split('')
    .reverse()
    .join('');
};

export const gasCostInEthString = (
  gasPrice: number,
  gasLimitTransaction: number
): string => {
  return bigNumberWithDecimalToStr(
    BigNumber.from(Math.ceil(gasPrice * gasLimitTransaction)).mul(
      BigNumber.from(1e9)
    ),
    18
  );
};

// a nice way to represent the token value without carrying around as a string
export interface TokenValue {
  value: BigNumber;
  decimals: number;
}

// we should turn Token into a string when we return as a value in an API call
export const tokenValueToString = (t: TokenValue | string): string => {
  return typeof t === 'string'
    ? t
    : bigNumberWithDecimalToStr(t.value, t.decimals);
};

// safely parse a JSON from a string to a type.
export const safeJsonParse =
  <T>(guard: (o: any) => o is T) =>
  (text: string): ParseResult<T> => {
    const parsed = JSON.parse(text);
    return guard(parsed) ? { parsed, hasError: false } : { hasError: true };
  };

// If the JSON was parsed successfully, return the result, otherwises return the error
export type ParseResult<T> =
  | { parsed: T; hasError: false; error?: undefined }
  | { parsed?: undefined; hasError: true; error?: unknown };

export const latency = (startTime: number, endTime: number): number => {
  return (endTime - startTime) / 1000;
};

export const walletPath = './conf/wallets';

// convert a fraction string to a number
export const fromFractionString = (value: string): number | null => {
  if (isFractionString(value)) {
    const num = number(fraction(value)); // this can return different mathematical values, control for number
    if (typeof num === 'number') {
      return num;
    } else {
      return null;
    }
  } else {
    return null;
  }
};

// convert a number to a fraction string or verify that a string is a string
// of a fraction
export const toFractionString = (value: number | string): string | null => {
  if (typeof value === 'number') {
    return format(fraction(value), { fraction: 'ratio' });
  } else {
    if (isFractionString(value) || isFloatString(value)) {
      return format(fraction(value), { fraction: 'ratio' });
    } else {
      return null;
    }
  }
  return null;
};

export const floatStringWithDecimalToBigNumber = (
  floatString: string,
  d: number
): BigNumber | null => {
  if (d < 0) {
    return null;
  }
  const split = floatString.split('.');
  const left = split[0];
  let right: string;
  if (split.length === 2) {
    right = split[1].slice(0, d).padEnd(d, '0');
  } else {
    right = ''.padEnd(d, '0');
  }
  try {
    return BigNumber.from(left + right);
  } catch (_e) {
    return null;
  }
};

export const floatStringWithDecimalToFixed = (
  floatString: string,
  d: number
): string | null => {
  if (d < 0) {
    return null;
  }
  const split = floatString.split('.');
  const left = split[0];
  let right: string;
  if (split.length === 2) {
    right = split[1].slice(0, d).padEnd(d, '0');
  } else {
    right = ''.padEnd(d, '0');
  }
  try {
    return left + '.' + right;
  } catch (_e) {
    return null;
  }
};

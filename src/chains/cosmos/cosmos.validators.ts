import { normalizeBech32, fromHex } from '@cosmjs/encoding';

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

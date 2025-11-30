import { normalizeBech32, fromHex } from '@cosmjs/encoding';

export const isValidCosmosAddress = (str: string): string => {
  try {
    normalizeBech32(str);
    return str;
  } catch (e) {
    return undefined;
  }
};
export const isValidCosmosPrivateKey = (str: string): boolean => {
  try {
    fromHex(str);
    return true;
  } catch (e) {
    return false;
  }
};

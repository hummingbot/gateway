import { AssetInfo } from '@oraichain/oraidex-contracts-sdk';

/**
 *
 * @param value
 * @param errorMessage
 */
export const getNotNullOrThrowError = <R>(
  value?: any,
  errorMessage: string = 'Value is null or undefined'
): R => {
  if (value === undefined || value === null) throw new Error(errorMessage);

  return value as R;
};

/**
 *
 * @param milliseconds
 */
export const sleep = (milliseconds: number) =>
  new Promise((callback) => setTimeout(callback, milliseconds));

/**
 *
 * @param address native denom or contract address
 * @returns return asset info
 */
export const parseToAssetInfo = (address: string): AssetInfo => {
  const lowercaseAddress = address.toLocaleLowerCase();

  if (lowercaseAddress === 'orai' || lowercaseAddress.startsWith('ibc/')) {
    return {
      native_token: {
        denom: address,
      },
    };
  }

  return {
    token: {
      contract_addr: address,
    },
  };
};

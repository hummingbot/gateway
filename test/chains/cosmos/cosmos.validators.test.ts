import { isValidCosmosAddress } from '../../../src/chains/cosmos/cosmos.validators';
import 'jest-extended';

export const publicKey = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
export const privateKey = 'b6dd181dfa0023013b2479c109e483cb8dc3c20d6fdae6b2443be147c11e5220'; // noqa: mock

export const missingParameter = (key: string): string => {
  return `The request is missing the key: ${key}`;
};

describe('isValidCosmosAddress', () => {
  it('fail against a string that is too short', () => {
    expect(isValidCosmosAddress(publicKey.substring(2))).toEqual(undefined);
  });

  it('fail against a string that is too long', () => {
    expect(isValidCosmosAddress(publicKey + 1)).toEqual(undefined);
  });
});

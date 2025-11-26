import { isValidCosmosAddress } from '../../../src/chains/cosmos/cosmos.validators';
import 'jest-extended';

export const publicKey = 'cosmos1pc8m5m7n0z8xe7sx2tawkvc0v6qkjql83js0dr';
export const privateKey = 'b6dd181dfa0023013b2479c109e483cb8dc3c20d6fdae6b2443be147c11e5220'; // noqa: mock

export const missingParameter = (key: string): string => {
  return `The request is missing the key: ${key}`;
};

describe('isValidCosmosAddress', () => {
  it('pass against a well formed public key', () => {
    expect(isValidCosmosAddress(publicKey)).toEqual(true);
  });

  it('fail against a string that is too short', () => {
    expect(isValidCosmosAddress(publicKey.substring(2))).toEqual(false);
  });

  it('fail against a string that is too long', () => {
    expect(isValidCosmosAddress(publicKey + 1)).toEqual(false);
  });
});
describe('isValidCosmosPrivateKey', () => {
  it('pass against a well formed private key', () => {
    expect(isValidCosmosAddress(privateKey)).toEqual(true);
  });

  it('fail against non-hex string', () => {
    expect(isValidCosmosAddress('zzzzZZ')).toEqual(false);
  });
});

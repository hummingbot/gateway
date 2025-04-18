import {KeyringPair} from '@polkadot/keyring/types';

/**
 * Represents a Polkadot account with its address and keys
 */
export interface PolkadotAccount {
  /** The public address of the account */
  address: string;
  /** The public key in hex format */
  publicKey: string;
  /** Optional keyring pair for signing transactions */
  keyringPair?: KeyringPair;
}

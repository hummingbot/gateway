import {
  mkValidator,
  Validator,
  isBase58,
} from '../../services/validators';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';

export const invalidPrivateKeyError: string =
  'The privateKey param is not a valid Solana private key (base58 string worth 64 bytes).';

export const invalidPublicKeyError: string =
  'The spender param is not a valid Solana address (base58 string worth 32 bytes).';

// test if a string matches the shape of an Solana address
export const isPublicKey = (str: string): boolean => {
  return isBase58(str) && bs58.decode(str).length == 32;
};

// given a request, look for a key called address that is an Solana address
export const validatePublicKey: Validator = mkValidator(
  'address',
  invalidPublicKeyError,
  (val) => typeof val === 'string' && isPublicKey(val)
);

export const validateSolPrivateKey = (secretKey: string): boolean => {
  try {
    const secretKeyBytes = bs58.decode(secretKey);
    Keypair.fromSecretKey(new Uint8Array(secretKeyBytes));
    return true;
  } catch (error) {
    return false;
  }
};

import {
  mkValidator,
  mkRequestValidator,
  RequestValidator,
  Validator,
  mkSelectingValidator,
} from '../validators';

import { validateSolPrivateKey as isSolPrivateKey } from '../../chains/solana/solana.validators';

const { fromBase64 } = require('@cosmjs/encoding');

export const invalidAlgorandPrivateKeyOrMnemonicError: string =
  'The privateKey param is not a valid Algorand private key or mnemonic.';

export const invalidEthPrivateKeyError: string =
  'The privateKey param is not a valid Ethereum private key (64 hexadecimal characters).';

export const invalidCosmosPrivateKeyError: string =
  'The privateKey param is not a valid Cosmos private key.';

export const invalidTezosPrivateKeyError: string =
  'The privateKey param is not a valid Tezos private key.';

export const invalidSolPrivateKeyError: string =
  'The privateKey param is not a valid Solana private key.';

export const invalidTonPrivateKeyOrMnemonicError: string =
  'The privateKey param is not a valid Ton private key or mnemonic.';

export const isAlgorandPrivateKeyOrMnemonic = (str: string): boolean => {
  const parts = str.split(' ');
  return parts.length === 25;
};

// test if a string matches the shape of an Ethereum private key
export const isEthPrivateKey = (str: string): boolean => {
  return /^(0x|xdc)?[a-fA-F0-9]{64}$/.test(str);
};

export const isCosmosPrivateKey = (str: string): boolean => {
  try {
    fromBase64(str);

    return true;
  } catch {
    return false;
  }
};

export const isTezosPrivateKey = (str: string): boolean => {
  try {
    const prefix = str.substring(0, 4);
    if (prefix !== 'edsk' && prefix !== 'spsk' && prefix !== 'p2sk') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

// TODO check!!!
export const isTonPrivateKeyOrMnemonic = (_str: string): boolean => {
  // const parts = str.split(' ');
  // return parts.length === 24;
  return true
};

// given a request, look for a key called privateKey that is an Ethereum private key
export const validatePrivateKey: Validator = mkSelectingValidator(
  'chain',
  (req, key) => req[key],
  {
    algorand: mkValidator(
      'privateKey',
      invalidAlgorandPrivateKeyOrMnemonicError,
      (val) => typeof val === 'string' && isAlgorandPrivateKeyOrMnemonic(val),
    ),
    ethereum: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    cronos: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    avalanche: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    harmony: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    cosmos: mkValidator(
      'privateKey',
      invalidCosmosPrivateKeyError,
      (val) => typeof val === 'string' && isCosmosPrivateKey(val),
    ),
    celo: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val)
    ),
    osmosis: mkValidator(
      'privateKey',
      invalidCosmosPrivateKeyError,
      (val) => typeof val === 'string' && isCosmosPrivateKey(val),
    ),
    polygon: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    'binance-smart-chain': mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    xdc: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    tezos: mkValidator(
      'privateKey',
      invalidTezosPrivateKeyError,
      (val) => typeof val === 'string' && isTezosPrivateKey(val),
    ),
    solana: mkValidator(
      'privateKey',
      invalidSolPrivateKeyError,
      (val) => typeof val === 'string' && isSolPrivateKey(val)
    ),
    telos: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    'ethereum-classic': mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    ton: mkValidator(
      'privateKey',
      invalidTonPrivateKeyOrMnemonicError,
      (val) => typeof val === 'string' && isTonPrivateKeyOrMnemonic(val),
    ),
  },
);

export const invalidChainError: string =
  'chain connector name is invalid';

export const invalidNetworkError: string =
  'expected a string for the network key';

export const invalidAddressError: string = 'address must be a string';

export const invalidAccountIDError: string = 'account ID must be a string';

export const invalidMessageError: string =
  'message to be signed must be a string';

export const validateChain: Validator = mkValidator(
  'chain',
  invalidChainError,
  (val) =>
    typeof val === 'string' &&
    (val === 'algorand' ||
      val === 'ethereum' ||
      val === 'avalanche' ||
      val === 'polygon' ||
      val === 'celo' ||
      val === 'xdc' ||
      val === 'harmony' ||
      val === 'cronos' ||
      val === 'cosmos' ||
      val === 'osmosis' ||
      val === 'binance-smart-chain' ||
      val === 'tezos' ||
      val === 'solana' ||
      val === 'telos' ||
      val === 'ethereum-classic' ||
      val === 'ton'),
);

export const validateNetwork: Validator = mkValidator(
  'network',
  invalidNetworkError,
  (val) => typeof val === 'string',
);

export const validateAddress: Validator = mkValidator(
  'address',
  invalidAddressError,
  (val) => typeof val === 'string',
);

export const validateAccountID: Validator = mkValidator(
  'accountId',
  invalidAccountIDError,
  (val) => typeof val === 'string',
  true,
);

export const validateMessage: Validator = mkValidator(
  'message',
  invalidMessageError,
  (val) => typeof val === 'string',
  true,
);

export const validateAddWalletRequest: RequestValidator = mkRequestValidator([
  validatePrivateKey,
  validateChain,
  validateNetwork,
  validateAccountID,
]);

export const validateRemoveWalletRequest: RequestValidator = mkRequestValidator(
  [validateAddress, validateChain],
);

export const validateWalletSignRequest: RequestValidator = mkRequestValidator([
  validateAddress,
  validateChain,
  validateNetwork,
  validateMessage,
]);

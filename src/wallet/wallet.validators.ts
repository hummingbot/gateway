import {
  mkValidator,
  mkRequestValidator,
  RequestValidator,
  Validator,
  mkSelectingValidator,
} from '../services/validators';

import { validateSolPrivateKey as isSolPrivateKey } from '../chains/solana/solana.validators';

export const invalidEthPrivateKeyError: string =
  'The privateKey param is not a valid Ethereum private key (64 hexadecimal characters).';

export const invalidSolPrivateKeyError: string =
  'The privateKey param is not a valid Solana private key.';


// test if a string matches the shape of an Ethereum private key
export const isEthPrivateKey = (str: string): boolean => {
  return /^(0x|xdc)?[a-fA-F0-9]{64}$/.test(str);
};
// given a request, look for a key called privateKey that is an Ethereum private key
export const validatePrivateKey: Validator = mkSelectingValidator(
  'chain',
  (req, key) => req[key],
  {
    ethereum: mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    'binance-smart-chain': mkValidator(
      'privateKey',
      invalidEthPrivateKeyError,
      (val) => typeof val === 'string' && isEthPrivateKey(val),
    ),
    solana: mkValidator(
      'privateKey',
      invalidSolPrivateKeyError,
      (val) => typeof val === 'string' && isSolPrivateKey(val)
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
    (val === 'ethereum' ||
      val === 'binance-smart-chain' ||
      val === 'solana'),
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

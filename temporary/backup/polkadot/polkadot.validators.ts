// noinspection ES6PreferShortImport
import {
  mkRequestValidator,
  mkValidator,
  RequestValidator,
  validateTxHash,
  Validator,
} from '../../services/validators';

const INVALID_NETWORK_ERROR = 'The network parameter must be a string.';

export const validateNetwork: Validator = mkValidator(
  'network',
  INVALID_NETWORK_ERROR,
  (val) => typeof val === 'string',
);

export const validatePolkadotPollRequest: RequestValidator = mkRequestValidator(
  [validateNetwork, validateTxHash],
);

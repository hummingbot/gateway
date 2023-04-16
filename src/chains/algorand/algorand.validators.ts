import {
  mkRequestValidator,
  mkValidator,
  RequestValidator,
  validateTokenSymbols,
  Validator,
} from '../../services/validators';
import {
  invalidAddressError,
  validateNetwork,
} from '../ethereum/ethereum.validators';
import { validateTxHash } from '../injective/injective.validators';
import { invalidChainError } from '../near/near.validators';

const validateAlgorandChain: Validator = mkValidator(
  'chain',
  invalidChainError,
  (val) => typeof val === 'string' && val === 'algorand'
);

const validateAlgorandAddress: Validator = mkValidator(
  'address',
  invalidAddressError,
  (val) => typeof val === 'string' && /[A-Z0-9]{58}/.test(val)
);

export const validateAlgorandPollRequest: RequestValidator = mkRequestValidator(
  [validateNetwork, validateTxHash]
);

export const validateAlgorandBalanceRequest: RequestValidator =
  mkRequestValidator([
    validateAlgorandChain,
    validateNetwork,
    validateAlgorandAddress,
    validateTokenSymbols,
  ]);

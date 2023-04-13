import {
  mkRequestValidator,
  RequestValidator,
} from '../../services/validators';
import { validateNetwork } from '../ethereum/ethereum.validators';
import { validateTxHash } from '../injective/injective.validators';

export const validatePollRequest: RequestValidator = mkRequestValidator([
  validateNetwork,
  validateTxHash,
]);

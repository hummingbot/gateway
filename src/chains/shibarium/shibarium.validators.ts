import {
  mkRequestValidator,
  mkValidator,
  RequestValidator,
  Validator,
  validateAmount,
  validateToken,
  validateTokenSymbols,
} from '../../services/validators';
import {
  isAddress,
  validateNonce,
  validateAddress,
} from '../ethereum/ethereum.validators';

export const invalidSpenderError: string =
  'The spender param is not a valid Shibarium address (0x followed by 40 hexidecimal characters).';

// given a request, look for a key called spender that is 'uniswap', 'sushi' or an Ethereum address
export const validateSpender: Validator = mkValidator(
  'spender',
  invalidSpenderError,
  (val) =>
    typeof val === 'string' &&
    (val === 'shibaswap' || val === 'chewyswap' || isAddress(val)),
);

export const validateApproveRequest: RequestValidator = mkRequestValidator([
  validateAddress,
  validateSpender,
  validateToken,
  validateAmount,
  validateNonce,
]);

export const validateAllowancesRequest: RequestValidator = mkRequestValidator([
  validateAddress,
  validateSpender,
  validateTokenSymbols,
]);

import {
  invalidTokenSymbolsError,
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

export const validateAssetSymbols: Validator = (req: any) => {
  const errors: Array<string> = [];
  if (req.assetSymbols) {
    if (Array.isArray(req.assetSymbols)) {
      req.tokenSymbols.forEach((symbol: any) => {
        if (typeof symbol !== 'string') {
          errors.push(invalidTokenSymbolsError);
        }
      });
    } else if (typeof req.assetSymbols !== 'string') {
      errors.push(invalidTokenSymbolsError);
    }
  }
  return errors;
};

export const validateAssetSymbol: Validator = mkValidator(
  'assetSymbol',
  invalidTokenSymbolsError,
  (val) => typeof val === 'string'
);

export const validateAssetsRequest: RequestValidator = mkRequestValidator([
  validateNetwork,
  validateAssetSymbols,
]);

export const validateOptInRequest: RequestValidator = mkRequestValidator([
  validateNetwork,
  validateAlgorandAddress,
  validateAssetSymbol,
]);

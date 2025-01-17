import {
  invalidTokenSymbolsError,
  mkRequestValidator,
  mkValidator,
  RequestValidator,
  validateTokenSymbols,
  Validator,
} from '../../services/validators';


const invalidTxHashError: string = 'The txHash param must be a string.';
export const invalidAddressError: string =
  'The address param is not a valid Ton private key (string mnemonic).';
export const invalidNetworkError: string = 'The network param is not a string.';

export const validateNetwork: Validator = mkValidator(
  'network',
  invalidNetworkError,
  (val) => typeof val === 'string'
);
export const validateTxHash: Validator = mkValidator(
  'txHash',
  invalidTxHashError,
  (val) => typeof val === 'string',
);

export const validateTonAddress: Validator = mkValidator(
  'address',
  invalidAddressError,
  (val) => typeof val === 'string',
);

export const validateTonPollRequest: RequestValidator = mkRequestValidator([
  validateNetwork,
  validateTxHash,
]);

export const validateTonBalanceRequest: RequestValidator = mkRequestValidator([
  validateNetwork,
  validateTonAddress,
  validateTokenSymbols,
]);

export const validateAssetSymbols: Validator = (req: any) => {
  const errors: Array<string> = [];
  if (req.assetSymbols) {
    if (Array.isArray(req.assetSymbols)) {
      req.assetSymbols.forEach((symbol: any) => {
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
  (val) => typeof val === 'string',
);

export const validateAssetsRequest: RequestValidator = mkRequestValidator([
  validateNetwork,
  validateAssetSymbols,
]);

// export const validateOptInRequest: RequestValidator = mkRequestValidator([
//   validateNetwork,
//   validateTonAddress,
//   validateAssetSymbol,
// ]);

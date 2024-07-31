import {
  isFloatString,
  mkValidator,
  mkRequestValidator,
  RequestValidator,
  Validator,
} from '../services/validators';

import {
  isAddress,
  validateChain,
  validateNetwork,
} from '../chains/ethereum/ethereum.validators';

import { isXRPLAddress } from '../chains/xrpl/xrpl.validators';

import {
  validateConnector,
  validateAmount,
  validateSide,
} from '../amm/amm.validators';
import { isValidKujiraPublicKey } from '../connectors/kujira/kujira.helpers';

import { isPublicKey as isValidSolanaAddress } from '../chains/solana/solana.validators';

export const invalidMarketError: string =
  'The market param is not a valid market. Market should be in {base}-{quote} format.';

export const invalidSkipError: string =
  'skip is not valid. It should either be undefined or a non-negative integer.';

export const invalidLimitError: string =
  'limit is not valid. It should either be undefined or an integer between 0 and 100.';

export const invalidEndTimeError: string =
  'endTime is not valid. It should either be undefined or a timestamp.';

export const invalidPriceError: string =
  'The price param may be null or a string of a float or integer number.';

export const invalidWalletError: string =
  'The address param is not a valid address.';

export const invalidOrderIdError: string =
  'The OrderId param is not a valid orderId.';

export const invalidOrderTypeError: string =
  'The orderType specified is invalid. Valid value is either `LIMIT` or `LIMIT_MAKER`';

export const invalidLeverageError: string =
  'The leverage param must be a number.';

export const validateMarket: Validator = mkValidator(
  'market',
  invalidMarketError,
  (val) => typeof val === 'string' && val.split('-').length === 2
);

export const validateMarkets: Validator = mkValidator(
  'markets',
  invalidMarketError,
  (val) => typeof val === 'object' && val.map((x: any) => typeof x === 'string')
);

export const validateSkip: Validator = mkValidator(
  'skip',
  invalidSkipError,
  (val) => typeof val === 'number' && val >= 0,
  true
);

export const validateLeverage: Validator = mkValidator(
  'leverage',
  invalidLimitError,
  (val) => typeof val === 'number'
);

export const validateLimit: Validator = mkValidator(
  'limit',
  invalidLimitError,
  (val) => typeof val === 'number' && val >= 0 && val <= 100,
  true
);

export const validateEndTime: Validator = mkValidator(
  'endTime',
  invalidEndTimeError,
  (val) => typeof val === 'number' && val >= 0,
  true
);

export const validatePrice: Validator = mkValidator(
  'price',
  invalidPriceError,
  (val) => typeof val === 'string' && isFloatString(val),
  true
);

export const validateWallet: Validator = mkValidator(
  'address',
  invalidWalletError,
  (val) => {
    return (
      typeof val === 'string' &&
      (isAddress(val.slice(0, 42)) ||
        isValidKujiraPublicKey(val) ||
        isXRPLAddress(val) ||
        isValidSolanaAddress(val))
    );
  }
);

export const validateOrderId: Validator = mkValidator(
  'orderId',
  invalidOrderIdError,
  (val) => typeof val === 'string'
);

export const validateOrderType: Validator = mkValidator(
  'orderType',
  invalidOrderTypeError,
  (val) =>
    typeof val === 'string' &&
    (val === 'LIMIT' || val === 'LIMIT_MAKER' || val === 'MARKET')
);

const NETWORK_VALIDATIONS = [validateConnector, validateChain, validateNetwork];

export const validateBasicRequest: RequestValidator =
  mkRequestValidator(NETWORK_VALIDATIONS);

export const validateMarketRequest: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([validateMarket])
);

export const validatePostOrderRequest: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([
    validateAmount,
    validateWallet,
    validateSide,
    validateOrderType,
    validatePrice,
  ])
);

export const validatePostPerpOrderRequest: RequestValidator =
  mkRequestValidator(
    NETWORK_VALIDATIONS.concat([
      validateAmount,
      validateWallet,
      validateSide,
      validateOrderType,
      validatePrice,
      validateLeverage,
    ])
  );

export const validateOrderRequest: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([validateOrderId])
);

export const validatePerpTradesRequest: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([validateOrderId, validateWallet, validateMarket])
);

export const validatePerpOrderRequest: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([validateWallet, validateMarket])
);

export const validateFundingInfoRequest: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([validateMarket])
);

export const validateFundingPaymentsRequest: RequestValidator =
  mkRequestValidator(
    NETWORK_VALIDATIONS.concat([validateWallet, validateMarket])
  );

export const validateBatchOrdersRequest: RequestValidator =
  mkRequestValidator(NETWORK_VALIDATIONS);

export const validatePositionsRequest: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([validateWallet, validateMarkets])
);

export const validatePerpLastTradePrice: RequestValidator = mkRequestValidator(
  NETWORK_VALIDATIONS.concat([validateMarket])
);

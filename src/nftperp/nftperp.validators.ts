import {
    mkValidator,
    mkRequestValidator,
    RequestValidator,
    Validator,
} from '../services/validators';
import { Amm } from "@nftperp/sdk/types";
import {
    validateAddress,
    validateChain,
    validateNetwork,
} from '../chains/ethereum/ethereum.validators';

export const invalidConnectorError: string =
    'The connector param is not a string.';

export const invalidSideError: string =
    'The side param must be a string of "BUY" or "SELL".';

export const invalidAmmError: string =
    'The amm param must be one of Amm enums';

export const validateConnector: Validator = mkValidator(
    'connector',
    invalidConnectorError,
    (val) => typeof val === 'string'
);


export const validateSide: Validator = mkValidator(
    'side',
    invalidSideError,
    (val) => typeof val === 'string' && (val === 'BUY' || val === 'SELL')
);

export const validateAmm: Validator = mkValidator('amm', invalidAmmError, (val) => typeof val === 'string' && ((Object.values(Amm) as string[]).includes(val)))

export const validateNetworkSelectionRequest: RequestValidator = mkRequestValidator([
    validateConnector,
    validateChain,
    validateNetwork
]);

export const validateNftPerpCommonRequest: RequestValidator = mkRequestValidator([
    validateConnector,
    validateChain,
    validateNetwork,
    validateAmm,
]);

export const validateGetPositionRequest: RequestValidator = mkRequestValidator([
    validateConnector,
    validateChain,
    validateNetwork,
    validateAmm,
    validateAddress,
])

export const validateCommonWriteTxRequest: RequestValidator = mkRequestValidator([
    validateConnector,
    validateChain,
    validateNetwork,
    validateAddress,
]);


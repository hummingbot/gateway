import {
  RequestValidator,
  Validator,
  isFloatString,
  isFractionString,
  mkRequestValidator,
} from '../services/validators';
import { fromFractionString, toFractionString } from '../services/base';
import { Static } from '@sinclair/typebox';
import { ConfigUpdateRequestSchema } from './config.routes';

type ConfigUpdateRequest = Static<typeof ConfigUpdateRequestSchema>;

export const invalidAllowedSlippage: string =
  'allowedSlippage should be a number between 0.0 and 1.0 or a string of a fraction.';

// only permit percentages 0.0 (inclusive) to less than 1.0
export const isAllowedPercentage = (val: string | number): boolean => {
  if (typeof val === 'string') {
    if (isFloatString(val)) {
      const num: number = parseFloat(val);
      return num >= 0.0 && num < 1.0;
    } else {
      const num: number | null = fromFractionString(val);
      return num !== null && num >= 0.0 && num < 1.0;
    }
  }
  return val >= 0.0 && val < 1.0;
};

export const validateAllowedSlippage: Validator = (req: any) => {
  const errors: Array<string> = [];
  const configPath: string = req.configPath;
  
  if (configPath.endsWith('allowedSlippage')) {
    const configValue = req.configValue;
    if (!(
      (typeof configValue === 'number' ||
        (typeof configValue === 'string' &&
          (isFractionString(configValue) || isFloatString(configValue)))) &&
      isAllowedPercentage(configValue)
    )) {
      errors.push(invalidAllowedSlippage);
    }
  }
  return errors;
};

export const validateConfigUpdateRequest: RequestValidator = mkRequestValidator(
  [validateAllowedSlippage]
);

// Mutates the input value in place to convert to fraction string format
export const updateAllowedSlippageToFraction = (
  body: ConfigUpdateRequest
): void => {
  if (body.configPath.endsWith('allowedSlippage')) {
    if (
      typeof body.configValue === 'number' ||
      (typeof body.configValue === 'string' &&
        !isFractionString(body.configValue))
    ) {
      body.configValue = toFractionString(body.configValue);
    }
  }
};

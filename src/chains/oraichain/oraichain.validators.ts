import {
  RequestValidator,
  mkRequestValidator,
} from '../../services/validators';

export const validateGetTokensRequest: RequestValidator = mkRequestValidator(
  []
);

import { Chain as Ethereumish } from '../../services/common-interfaces';
import { AllowancesRequest, ApproveRequest } from '../chain.requests';
import { EVMController } from '../ethereum/evm.controllers';
import {
  validateXdcAllowancesRequest,
  validateXdcApproveRequest,
} from './xdc.validators';

export class XDCCOntroller extends EVMController {
  static async allowances(ethereumish: Ethereumish, req: AllowancesRequest) {
    validateXdcAllowancesRequest(req);
    return EVMController.allowancesWithoutValidation(ethereumish, req);
  }

  static async approve(ethereumish: Ethereumish, req: ApproveRequest) {
    validateXdcApproveRequest(req);
    return await EVMController.approveWithoutValidation(ethereumish, req);
  }
}

/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import { Response, Router, Request } from 'express';
import { asyncHandler } from '../../services/error-handler';
import { PollRequest, PollResponse } from './algorand.requests';
import { validatePollRequest } from './algorand.validators';
import { getChain } from '../../services/connection-manager';
import { Algorand } from './algorand';
import { poll } from './algorand.controller';

export namespace AlgorandRoutes {
  export const router = Router();

  router.post(
    '/poll',
    asyncHandler(
      async (
        req: Request<{}, {}, PollRequest>,
        res: Response<PollResponse, {}>
      ) => {
        validatePollRequest(req.body);
        const algorand = await getChain('algorand', req.body.network);
        res.status(200).json(await poll(<Algorand>algorand, req.body));
      }
    )
  );
}

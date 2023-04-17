/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import { Response, Router, Request, NextFunction } from 'express';
import { asyncHandler } from '../../services/error-handler';
import {
  AssetsRequest,
  AssetsResponse,
  PollRequest,
  PollResponse,
} from './algorand.requests';
import {
  validateAlgorandBalanceRequest,
  validateAlgorandPollRequest,
  validateAssetsRequest,
} from './algorand.validators';
import { getInitializedChain } from '../../services/connection-manager';
import { Algorand } from './algorand';
import { balances, getAssets, poll } from './algorand.controller';
import {
  BalanceRequest,
  BalanceResponse,
} from '../../network/network.requests';

export namespace AlgorandRoutes {
  export const router = Router();

  router.post(
    '/poll',
    asyncHandler(
      async (
        req: Request<{}, {}, PollRequest>,
        res: Response<PollResponse, {}>
      ) => {
        validateAlgorandPollRequest(req.body);
        const algorand = await getInitializedChain(
          'algorand',
          req.body.network
        );
        res.status(200).json(await poll(<Algorand>algorand, req.body));
      }
    )
  );

  router.post(
    '/balances',
    asyncHandler(
      async (
        req: Request<{}, {}, BalanceRequest>,
        res: Response<BalanceResponse | string, {}>,
        _next: NextFunction
      ) => {
        validateAlgorandBalanceRequest(req.body);
        const chain = await getInitializedChain<Algorand>(
          req.body.chain,
          req.body.network
        );

        res.status(200).json(await balances(chain, req.body));
      }
    )
  );

  router.get(
    '/assets',
    asyncHandler(
      async (
        req: Request<{}, {}, {}, AssetsRequest>,
        res: Response<AssetsResponse, {}>
      ) => {
        validateAssetsRequest(req.query);
        res.status(200).json(await getAssets(req.query));
      }
    )
  );
}

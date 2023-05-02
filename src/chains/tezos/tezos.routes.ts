import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../services/error-handler';

import * as tezosControllers from './tezos.controllers';

import {
  validateTezosAllowancesRequest,
  validateTezosApproveRequest,
  validateTezosBalanceRequest,
  validateTezosNonceRequest,
} from './tezos.validators';

import {
  AllowancesRequest,
  AllowancesResponse,
  ApproveRequest,
  ApproveResponse,
  BalanceRequest,
  BalanceResponse,
  NonceRequest,
  NonceResponse,
  PollRequest,
  PollResponse,
} from './tezos.request';

import { Tezosish } from '../../services/common-interfaces';
import { getInitializedChain } from '../../services/connection-manager';

export namespace TezosRoutes {
  export const router = Router();

  router.post(
    '/nonce',
    asyncHandler(
      async (
        req: Request<{}, {}, NonceRequest>,
        res: Response<NonceResponse | string, {}>
      ) => {
        validateTezosNonceRequest(req.body);
        const chain = await getInitializedChain(req.body.chain, req.body.network);
        res.status(200).json(await tezosControllers.nonce(chain as Tezosish, req.body));
      }
    )
  );

  router.post(
    '/balances',
    asyncHandler(
      async (
        req: Request<{}, {}, BalanceRequest>,
        res: Response<BalanceResponse | string, {}>,
      ) => {
        validateTezosBalanceRequest(req.body);
        const chain = await getInitializedChain('tezos', req.body.network);
        res.status(200).json((await tezosControllers.balances(chain as Tezosish, req.body)));
      }
    )
  );

  router.post(
    '/poll',
    asyncHandler(
      async (
        req: Request<{}, {}, PollRequest>,
        res: Response<PollResponse, {}>
      ) => {
        const chain = await getInitializedChain('tezos', <string>req.body.network);
        res
          .status(200)
          .json(
            await tezosControllers.poll(
              chain as Tezosish,
              {
                chain: req.body.chain,
                network: req.body.network,
                txHash: req.body.txHash
              }
            )
          );
      }
    )
  );

  router.post(
    '/allowances',
    asyncHandler(
      async (
        req: Request<{}, {}, AllowancesRequest>,
        res: Response<AllowancesResponse | string, {}>
      ) => {
        validateTezosAllowancesRequest(req.body);
        const chain = await getInitializedChain(req.body.chain, req.body.network);
        res.status(200).json(await tezosControllers.allowances(chain as Tezosish, req.body));
      }
    )
  );

  router.post(
    '/approve',
    asyncHandler(
      async (
        req: Request<{}, {}, ApproveRequest>,
        res: Response<ApproveResponse | string, {}>
      ) => {
        validateTezosApproveRequest(req.body);
        const chain = await getInitializedChain(req.body.chain, req.body.network);
        res.status(200).json(await tezosControllers.approve(chain as Tezosish, req.body));
      }
    )
  );
}
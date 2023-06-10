/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
import { Router, Request, Response, NextFunction } from 'express';
import { Celoish } from '../../services/common-interfaces';
import { asyncHandler } from '../../services/error-handler';
import {
  approve,
  allowances,
  nonce,
  nextNonce,
  cancel,
  balances,
} from './celo.controllers';

import { getChain } from '../../services/connection-manager';
import {
  AllowancesRequest,
  AllowancesResponse,
  ApproveRequest,
  ApproveResponse,
  CancelRequest,
  CancelResponse,
  NonceRequest,
  NonceResponse,
} from '../../evm/evm.requests';
import {
  validateBalanceRequest as validateEthereumBalanceRequest,
  validateCancelRequest,
  validateNonceRequest,
} from '../ethereum/ethereum.validators';
import {
  validateCeloAllowancesRequest,
  validateCeloApproveRequest,
} from './celo.validators';
import {
  BalanceRequest,
  BalanceResponse,
} from '../../network/network.requests';

export namespace CeloRoutes {
  export const router = Router();

  router.post(
    '/nextNonce',
    asyncHandler(
      async (
        req: Request<{}, {}, NonceRequest>,
        res: Response<NonceResponse | string, {}>
      ) => {
        validateNonceRequest(req.body);
        const chain = await getChain<Celoish>(req.body.chain, req.body.network);
        res.status(200).json(await nextNonce(chain, req.body));
      }
    )
  );

  router.post(
    '/nonce',
    asyncHandler(
      async (
        req: Request<{}, {}, NonceRequest>,
        res: Response<NonceResponse | string, {}>
      ) => {
        validateNonceRequest(req.body);
        const chain = await getChain<Celoish>(req.body.chain, req.body.network);
        res.status(200).json(await nonce(chain, req.body));
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
        validateCeloAllowancesRequest(req.body);
        const chain = await getChain<Celoish>(req.body.chain, req.body.network);
        res.status(200).json(await allowances(chain, req.body));
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
        validateCeloApproveRequest(req.body);
        const chain = await getChain<Celoish>(req.body.chain, req.body.network);
        res.status(200).json(await approve(chain, req.body));
      }
    )
  );
  router.post(
    '/cancel',
    asyncHandler(
      async (
        req: Request<{}, {}, CancelRequest>,
        res: Response<CancelResponse, {}>
      ) => {
        validateCancelRequest(req.body);
        const chain = await getChain<Celoish>(req.body.chain, req.body.network);
        res.status(200).json(await cancel(chain, req.body));
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
        validateEthereumBalanceRequest(req.body);
        const chain = await getChain<Celoish>(req.body.chain, req.body.network);

        res.status(200).json(await balances(chain, req.body));
      }
    )
  );
}

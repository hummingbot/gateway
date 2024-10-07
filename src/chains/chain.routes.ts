/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/ban-types */
import { NextFunction, Request, Response, Router } from 'express';
import { Chain } from '../services/common-interfaces';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import { asyncHandler } from '../services/error-handler';
import {
  mkRequestValidator,
  RequestValidator,
  validateTxHash,
} from '../services/validators';
import {
  validateChain as validateEthereumChain,
  validateNetwork as validateEthereumNetwork,
} from '../chains/ethereum/ethereum.validators';
import { validateNonceRequest } from './ethereum/ethereum.validators';

import { getInitializedChain } from '../services/connection-manager';
import {
  AllowancesRequest,
  AllowancesResponse,
  ApproveRequest,
  ApproveResponse,
  CancelRequest,
  CancelResponse,
  NonceRequest,
  NonceResponse,
} from './chain.requests';
import { getStatus } from '../network/network.controllers';
import {
  StatusRequest,
  StatusResponse,
  BalanceRequest,
  BalanceResponse,
  PollRequest,
  PollResponse,
  TokensRequest,
  TokensResponse,
} from '../network/network.requests';
import {
  allowances,
  approve,
  balances,
  cancel,
  getTokens,
  nextNonce,
  nonce,
  poll,
  transfer,
} from './chain.controller';
import {
  TransferRequest,
  TransferResponse,
} from '../services/common-interfaces';
import { validateTezosNonceRequest } from './tezos/tezos.validators';

export const validatePollRequest: RequestValidator = mkRequestValidator([
  validateTxHash,
]);

export const validateTokensRequest: RequestValidator = mkRequestValidator([
  validateEthereumChain,
  validateEthereumNetwork,
]);

export namespace ChainRoutes {
  export const router = Router();

  router.get(
    '/status',
    asyncHandler(
      async (
        req: Request<{}, {}, {}, StatusRequest>,
        res: Response<StatusResponse | StatusResponse[], {}>,
      ) => {
        res.status(200).json(await getStatus(req.query));
      },
    ),
  );

  router.get('/config', (_req: Request, res: Response<any, any>) => {
    res.status(200).json(ConfigManagerV2.getInstance().allConfigurations);
  });

  router.post(
    '/balances',
    asyncHandler(
      async (
        req: Request<{}, {}, BalanceRequest>,
        res: Response<BalanceResponse | string, {}>,
        _next: NextFunction,
      ) => {
        console.log('req.body', req.body);
        const chain = await getInitializedChain<Chain>(
          req.body.chain,
          req.body.network,
        );

        res.status(200).json(await balances(chain, req.body));
      },
    ),
  );

  router.post(
    '/poll',
    asyncHandler(
      async (
        req: Request<{}, {}, PollRequest>,
        res: Response<PollResponse, {}>,
      ) => {
        const chain = await getInitializedChain(
          req.body.chain,
          req.body.network,
        );
        res.status(200).json(await poll(chain, req.body));
      },
    ),
  );

  router.get(
    '/tokens',
    asyncHandler(
      async (
        req: Request<{}, {}, {}, TokensRequest>,
        res: Response<TokensResponse, {}>,
      ) => {
        const chain = await getInitializedChain(
          req.query.chain as string,
          req.query.network as string,
        );
        res.status(200).json(await getTokens(chain, req.query));
      },
    ),
  );

  router.post(
    '/nextNonce',
    asyncHandler(
      async (
        req: Request<{}, {}, NonceRequest>,
        res: Response<NonceResponse | string, {}>,
      ) => {
        const chain = await getInitializedChain(
          req.body.chain,
          req.body.network,
        );
        res.status(200).json(await nextNonce(chain, req.body));
      },
    ),
  );

  router.post(
    '/nonce',
    asyncHandler(
      async (
        req: Request<{}, {}, NonceRequest>,
        res: Response<NonceResponse | string, {}>,
      ) => {
        if (req.body.chain === 'tezos') validateTezosNonceRequest(req.body);
        else validateNonceRequest(req.body);
        const chain = await getInitializedChain(
          req.body.chain,
          req.body.network,
        );
        res.status(200).json(await nonce(chain, req.body));
      },
    ),
  );

  router.post(
    '/allowances',
    asyncHandler(
      async (
        req: Request<{}, {}, AllowancesRequest>,
        res: Response<AllowancesResponse | string, {}>,
      ) => {
        const chain = await getInitializedChain(
          req.body.chain,
          req.body.network,
        );
        console.log(chain);
        res.status(200).json(await allowances(chain, req.body));
      },
    ),
  );

  router.post(
    '/approve',
    asyncHandler(
      async (
        req: Request<{}, {}, ApproveRequest>,
        res: Response<ApproveResponse | string, {}>,
      ) => {
        const chain = await getInitializedChain(
          req.body.chain,
          req.body.network,
        );
        res.status(200).json(await approve(chain, req.body));
      },
    ),
  );

  router.post(
    '/cancel',
    asyncHandler(
      async (
        req: Request<{}, {}, CancelRequest>,
        res: Response<CancelResponse, {}>,
      ) => {
        const chain = await getInitializedChain(
          req.body.chain,
          req.body.network,
        );
        res.status(200).json(await cancel(chain, req.body));
      },
    ),
  );

  router.post(
    '/transfer',
    asyncHandler(
      async (
        req: Request<{}, {}, TransferRequest>,
        res: Response<TransferResponse, {}>,
      ) => {
        const chain = await getInitializedChain(
          req.body.chain,
          req.body.network,
        );
        res.status(200).json(await transfer(chain, req.body));
      },
    ),
  );
}

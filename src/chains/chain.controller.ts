import { latency } from '../services/base';

import { Chain } from '../services/common-interfaces';

import {
  TransferRequest,
  TransferResponse,
} from '../services/common-interfaces';

import {
  BalanceRequest,
  BalanceResponse,
  PollRequest,
  PollResponse,
  TokensRequest,
  TokensResponse,
} from '../network/network.requests';
import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  AllowancesResponse,
  ApproveRequest,
  ApproveResponse,
  CancelRequest,
  CancelResponse,
} from './chain.requests';

export async function poll(
  chain: Chain,
  req: PollRequest,
): Promise<PollResponse> {
  const initTime = Date.now();
  const poll = await chain.controller.poll(chain, req);
  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...poll,
  };
}

export async function nonce(
  chain: Chain,
  req: NonceRequest,
): Promise<NonceResponse> {
  const initTime = Date.now();
  const nonce = await chain.controller.nonce(chain, req);
  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...nonce,
  };
}

export async function nextNonce(
  chain: Chain,
  req: NonceRequest,
): Promise<NonceResponse> {
  const initTime = Date.now();
  const nextNonce = await chain.controller.nextNonce(chain, req);
  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...nextNonce,
  };
}

export async function getTokens(
  chain: Chain,
  req: TokensRequest,
): Promise<TokensResponse> {
  const initTime = Date.now();
  const tokens = await chain.controller.getTokens(chain, req);
  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...tokens,
  };
}

export async function allowances(
  chain: Chain,
  req: AllowancesRequest,
): Promise<AllowancesResponse | string> {
  const initTime = Date.now();
  const allowances = await chain.controller.allowances(chain, req);

  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...allowances,
  };
}

export async function balances(
  chain: Chain,
  req: BalanceRequest,
): Promise<BalanceResponse | string> {
  const initTime = Date.now();
  const balances = await chain.controller.balances(chain, req);

  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...balances,
  };
}

export async function approve(
  chain: Chain,
  req: ApproveRequest,
): Promise<ApproveResponse | string> {
  const initTime = Date.now();
  const approveTx = await chain.controller.approve(chain, req);

  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...approveTx,
  };
}

export async function cancel(
  chain: Chain,
  req: CancelRequest,
): Promise<CancelResponse> {
  const initTime = Date.now();
  const cancelTx = await chain.controller.cancel(chain, req);

  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...cancelTx,
  };
}

export async function transfer(
  chain: Chain,
  req: TransferRequest,
): Promise<TransferResponse> {
  const initTime = Date.now();
  const transfer = await chain.controller.transfer(chain, req);

  return {
    network: chain.chain,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    ...transfer,
  };
}

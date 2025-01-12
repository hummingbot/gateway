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
  StatusRequest,
  StatusResponse,
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  AllowancesResponse,
  ApproveRequest,
  ApproveResponse,
  CancelRequest,
  CancelResponse,
} from './chain.requests';
import { HttpException, UNKNOWN_CHAIN_ERROR_CODE, UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE } from '../services/error-handler';
import { getInitializedChain, UnsupportedChainException } from '../services/connection-manager';
import { Ethereum } from './ethereum/ethereum';
import { Solana } from './solana/solana';

export async function poll(
  chain: Chain,
  req: PollRequest
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
  req: NonceRequest
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
  req: NonceRequest
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
  req: TokensRequest
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
  req: AllowancesRequest
): Promise<AllowancesResponse> {
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
  req: BalanceRequest
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
  req: ApproveRequest
): Promise<ApproveResponse> {
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
  req: CancelRequest
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
  req: TransferRequest
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

export async function getStatus(
  req: StatusRequest,
): Promise<StatusResponse | StatusResponse[]> {
  const statuses: StatusResponse[] = [];
  let connections: any[] = [];

  // Get chain from request URL (e.g., /solana/status -> solana)
  const chainName = req.url?.split('/')[1];
  if (!chainName) {
    throw new HttpException(
      500,
      UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE('undefined'),
      UNKNOWN_CHAIN_ERROR_CODE,
    );
  }

  try {
    connections.push(
      await getInitializedChain(chainName, req.network),
    );
  } catch (e) {
    if (e instanceof UnsupportedChainException) {
      throw new HttpException(
        500,
        UNKNOWN_KNOWN_CHAIN_ERROR_MESSAGE(chainName),
        UNKNOWN_CHAIN_ERROR_CODE,
      );
    }
    throw e;
  }

  for (const connection of connections) {
    const chain = connection.chain;
    const chainId = connection.chainId;
    const network = connection.network;
    const rpcUrl = connection.rpcUrl;
    const nativeCurrency = connection.nativeTokenSymbol;

    const currentBlockNumber = await connection.getCurrentBlockNumber();
    statuses.push({
      chain,
      chainId,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency,
    });
  }

  return statuses[0];
}

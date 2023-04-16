import { PollRequest, PollResponse } from '../algorand/algorand.requests';
import { Algorand } from './algorand';
import {
  BalanceRequest,
  BalanceResponse,
} from '../../network/network.requests';
import { latency } from '../../services/base';

export async function poll(
  algorand: Algorand,
  req: PollRequest
): Promise<PollResponse> {
  return await algorand.getTransaction(req.txHash);
}

export async function balances(
  chain: Algorand,
  request: BalanceRequest
): Promise<BalanceResponse> {
  const initTime = Date.now();
  const balances: Record<string, string> = {};

  const account = await chain.getAccountFromAddress(request.address);

  if (request.tokenSymbols.includes(chain.nativeTokenSymbol)) {
    balances[chain.nativeTokenSymbol] = await chain.getNativeBalance(account);
  }

  for (const token of request.tokenSymbols) {
    if (token === chain.nativeTokenSymbol) continue;
    balances[token] = await chain.getAssetBalance(account, token);
  }

  return {
    network: request.network,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    balances: balances,
  };
}

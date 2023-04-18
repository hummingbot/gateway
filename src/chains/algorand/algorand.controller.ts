import {
  AlgorandAsset,
  AssetsRequest,
  AssetsResponse,
  OptInRequest,
  OptInResponse,
  PollRequest,
  PollResponse,
} from '../algorand/algorand.requests';
import { Algorand } from './algorand';
import {
  BalanceRequest,
  BalanceResponse,
} from '../../network/network.requests';
import { latency } from '../../services/base';
import {
  HttpException,
  NETWORK_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';

async function getInitializedAlgorand(network: string): Promise<Algorand> {
  const algorand = Algorand.getInstance(network);

  if (!algorand.ready()) {
    await algorand.init();
  }

  return algorand;
}

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

export async function getAssets(
  request: AssetsRequest
): Promise<AssetsResponse> {
  if (request.network === undefined) {
    throw new HttpException(
      500,
      'Missing network parameter',
      NETWORK_ERROR_CODE
    );
  }

  let assets: AlgorandAsset[] = [];
  const algorand = await getInitializedAlgorand(request.network);

  if (!request.assetSymbols) {
    assets = algorand.storedAssetList;
  } else {
    let assetSymbols;
    if (typeof request.assetSymbols === 'string') {
      assetSymbols = [request.assetSymbols];
    } else {
      assetSymbols = request.assetSymbols;
    }
    for (const a of assetSymbols as []) {
      assets.push(algorand.getAssetForSymbol(a) as AlgorandAsset);
    }
  }

  return {
    assets: assets,
  };
}

export async function optIn(request: OptInRequest): Promise<OptInResponse> {
  const initTime = Date.now();

  const algorand = await getInitializedAlgorand(request.network);
  const asset = algorand.getAssetForSymbol(request.assetSymbol);

  if (asset === undefined) {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + request.assetSymbol,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }

  const transactionResponse = await algorand.optIn(
    request.address,
    request.assetSymbol
  );

  return {
    network: request.network,
    timestamp: initTime,
    latency: latency(initTime, Date.now()),
    assetId: (asset as AlgorandAsset).assetId,
    transactionResponse: transactionResponse,
  };
}

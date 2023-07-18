import {
  AlgorandAsset,
  AssetsRequest,
  AssetsResponse,
  OptInRequest,
  PollRequest,
  PollResponse,
} from '../algorand/algorand.requests';
import { Algorand } from './algorand';
import { BalanceRequest } from '../../network/network.requests';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import {
  validateAlgorandBalanceRequest,
  validateAlgorandPollRequest,
  validateAssetsRequest,
  validateOptInRequest,
} from './algorand.validators';

async function getInitializedAlgorand(network: string): Promise<Algorand> {
  const algorand = Algorand.getInstance(network);

  if (!algorand.ready()) {
    await algorand.init();
  }

  return algorand;
}

export class AlgorandController {
  static async poll(
    algorand: Algorand,
    req: PollRequest
  ): Promise<PollResponse> {
    validateAlgorandPollRequest(req);

    return await algorand.getTransaction(req.txHash);
  }

  static async balances(chain: Algorand, request: BalanceRequest) {
    validateAlgorandBalanceRequest(request);

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
      balances: balances,
    };
  }

  static async getTokens(
    algorand: Algorand,
    request: AssetsRequest
  ): Promise<AssetsResponse> {
    validateAssetsRequest(request);

    let assets: AlgorandAsset[] = [];

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

  static async approve(request: OptInRequest) {
    validateOptInRequest(request);

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
      assetId: (asset as AlgorandAsset).assetId,
      transactionResponse: transactionResponse,
    };
  }
}

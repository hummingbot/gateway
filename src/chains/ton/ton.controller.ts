import {
  TonAsset,
  AssetsRequest,
  AssetsResponse,
  PollResponse,
  PollRequest,
  OptInRequest,
} from './ton.requests';
import { Ton } from './ton';
import {
  validateAssetsRequest,
  validateOptInRequest,
  validateTonBalanceRequest,
  validateTonPollRequest,
} from './ton.validators';
import { BalanceRequest } from '../tezos/tezos.request';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';

async function getInitializedTon(network: string): Promise<Ton> {
  const ton = Ton.getInstance(network);

  if (!ton.ready()) {
    await ton.init();
  }

  return ton;
}

export class TonController {
  static async poll(ton: Ton, req: PollRequest): Promise<PollResponse> {
    validateTonPollRequest(req);

    const transaction = await ton.getTransaction(req.txHash);

    if (!transaction) throw new Error('No transaction');

    const event = {
      currentBlock: Number((await ton.getCurrentBlockNumber()).seqno),
      txBlock: Number(
        transaction.transaction.block
          .replace('(', '')
          .replace(')', '')
          .split(',')[2],
      ),
      txHash: transaction.transaction.hash,
      fee: Number(transaction.transaction.totalFees) / 10 ** 9,
    };

    return event;
  }

  static async balances(chain: Ton, request: BalanceRequest) {
    validateTonBalanceRequest(request);
    const account = await chain.getAccountFromAddress(request.address);

    const tokensBalances = await chain.getAssetBalance(
      account.publicKey,
      request.tokenSymbols,
    );
    return {
      balances: tokensBalances,
    };
  }

  static async getTokens(
    ton: Ton,
    request: AssetsRequest,
  ): Promise<AssetsResponse> {
    validateAssetsRequest(request);

    let assets: TonAsset[] = [];

    if (!request.assetSymbols) {
      assets = ton.storedAssetList;
    } else {
      let assetSymbols;
      if (typeof request.assetSymbols === 'string') {
        assetSymbols = [request.assetSymbols];
      } else {
        assetSymbols = request.assetSymbols;
      }
      for (const a of assetSymbols as []) {
        assets.push(ton.getAssetForSymbol(a) as TonAsset);
      }
    }

    return {
      assets: assets,
    };
  }

  static async approve(request: OptInRequest) {
    validateOptInRequest(request);

    const ton = await getInitializedTon(request.network);
    const asset = ton.getAssetForSymbol(request.assetSymbol);

    if (asset === undefined) {
      throw new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + request.assetSymbol,
        TOKEN_NOT_SUPPORTED_ERROR_CODE,
      );
    }

    const transactionResponse = await ton.optIn(
      request.address,
      request.assetSymbol,
    );

    return {
      assetId: (asset as TonAsset).assetId,
      transactionResponse: transactionResponse,
    };
  }
}

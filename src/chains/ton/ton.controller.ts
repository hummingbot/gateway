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
  // validateOptInRequest,
  // validateTonBalanceRequest,
  validateTonPollRequest,
} from './ton.validators';
import { BalanceRequest } from '../tezos/tezos.request';



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
    console.log(event)
    return event;
  }

  static async balances(chain: Ton, request: BalanceRequest) {
    // validateTonBalanceRequest(request); 
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
        const asset = ton.getAssetForSymbol(a);
        if (!asset) {
          throw new Error(`Unsupported symbol: ${a}`);
        }
        assets.push(asset as TonAsset);
      }
    }

    return {
      assets: assets,
    };
  }

  static async approve(_request: OptInRequest) {
    throw new Error("Method not implemented.");
  }
}

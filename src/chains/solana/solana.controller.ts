import { Solana } from './solana';
import {
  AssetsRequest,
  AssetsResponse,
  BalancesRequest,
  PollRequest,
  SolanaAsset,
} from './solana.request';
import { validateAssetsRequest } from '../algorand/algorand.validators';

export class SolanaController {
  static async poll(solana: Solana, req: PollRequest) {
    return solana.getTransaction(req?.txHash);
  }
  static async balances(solana: Solana, req: BalancesRequest) {
    const balances: Record<string, string> = {};
    const account = await solana.getAccountFromAddress(req.address);
    if (req.tokenSymbols.includes(solana.nativeTokenSymbol)) {
      balances[solana.nativeTokenSymbol] =
        await solana.getNativeBalance(account);
    }

    for (const token of req.tokenSymbols) {
      if (token === solana.nativeTokenSymbol) continue;
      balances[token] = await solana.getAssetBalance(account, token);
    }
    return {
      balances: balances,
    };
  }
  static async getTokens(
    algorand: Solana,
    request: AssetsRequest,
  ): Promise<AssetsResponse> {
    validateAssetsRequest(request);

    let assets: SolanaAsset[] = [];

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
        assets.push(algorand.getAssetForSymbol(a) as SolanaAsset);
      }
    }

    return {
      assets: assets,
    };
  }
}

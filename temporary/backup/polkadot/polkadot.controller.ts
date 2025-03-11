import { validatePolkadotPollRequest } from './polkadot.validators';
import { Polkadot } from './polkadot';
// noinspection ES6PreferShortImport
import {
  BalanceRequest,
  PollRequest,
  PollResponse,
  TokensRequest,
  TokensResponse,
} from '../../network/network.requests';
// noinspection ES6PreferShortImport
import { TokenInfo } from '../../chains/ethereum/ethereum-base';

export class PolkadotController {
  static async poll(
    polkadot: Polkadot,
    req: PollRequest,
  ): Promise<PollResponse> {
    validatePolkadotPollRequest(req);
    return await polkadot.getTransaction(req.txHash);
  }

  static async balances(chain: Polkadot, request: BalanceRequest) {
    const balances: Record<string, string> = {};

    if (request.tokenSymbols.includes('HDX')) {
      balances['HDX'] = await chain.getNativeBalance(request.address);
    }

    for (const tokenSymbol of request.tokenSymbols) {
      if (tokenSymbol === 'HDX') continue;
      try {
        balances[tokenSymbol] = await chain.getAssetBalance(
          request.address,
          tokenSymbol,
        );
      } catch (error) {
        console.error(`Error retrieving balance for ${tokenSymbol}:`, error);
        balances[tokenSymbol] = '0';
      }
    }

    return { balances };
  }

  // noinspection JSUnusedGlobalSymbols
  static async getTokens(
    polkadot: Polkadot,
    request: TokensRequest,
  ): Promise<TokensResponse> {
    const tokens: TokenInfo[] = [];
    let assetSymbols: string[];

    if (!request.tokenSymbols) {
      assetSymbols = polkadot.storedAssetList.map((a) => a.symbol);
    } else if (typeof request.tokenSymbols === 'string') {
      assetSymbols = [request.tokenSymbols];
    } else {
      assetSymbols = request.tokenSymbols;
    }

    for (const symbol of assetSymbols) {
      const rawToken = polkadot.getAssetForSymbol(symbol);
      if (!rawToken) {
        throw new Error(`Unsupported symbol: ${symbol}`);
      }
      tokens.push({
        chainId: null,
        address: rawToken.id,
        name: rawToken.name,
        symbol: rawToken.symbol,
        decimals: rawToken.decimals,
      } as TokenInfo);
    }

    return { tokens };
  }
}

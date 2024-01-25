import { TokensRequest } from '../../network/network.requests';
import { TokenInfo } from '../../services/base';
import { CosmosController } from '../cosmos/cosmos.controllers';
import { Token } from '../cosmos/cosmos-base';
import { Oraichain } from './oraichain';
import { validateGetTokensRequest } from './oraichain.validators';

export class OraichainController extends CosmosController {
  static async getTokens(
    oraichainLish: Oraichain,
    req: TokensRequest
  ): Promise<{ tokens: TokenInfo[] }> {
    validateGetTokensRequest(req);

    let tokens: Token[] = [];
    if (!req.tokenSymbols) {
      tokens = oraichainLish.storedTokenList;
    } else {
      for (const t of req.tokenSymbols as []) {
        const token = oraichainLish.getTokenForSymbol(t);
        if (token != undefined) {
          tokens.push(token);
        }
      }
    }

    // convert token into TokenINfo
    const tokensInfo: TokenInfo[] = [];
    tokens.map((token) => {
      const tokenInfo: TokenInfo = {
        address: token.address,
        chainId: 0,
        decimals: token.decimals,
        name: token.name,
        symbol: token.symbol,
      };
      tokensInfo.push(tokenInfo);
    });

    return { tokens: tokensInfo };
  }
}

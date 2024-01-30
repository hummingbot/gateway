import { TokensRequest } from '../../network/network.requests';
import { TokenInfo } from '../../services/base';
import {
  // CosmosController,
  toCosmosBalances,
} from '../cosmos/cosmos.controllers';
import { Token } from '../cosmos/cosmos-base';
import { Oraichain } from './oraichain';
import { validateGetTokensRequest } from './oraichain.validators';
import {
  validateCosmosBalanceRequest,
  validateCosmosPollRequest,
} from '../cosmos/cosmos.validators';
import {
  CosmosBalanceRequest,
  CosmosPollRequest,
} from '../cosmos/cosmos.requests';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { decodeTxRaw } from '@cosmjs/proto-signing';

export class OraichainController {
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

  static async balances(cosmosish: Oraichain, req: CosmosBalanceRequest) {
    validateCosmosBalanceRequest(req);

    const wallet = await cosmosish.getWallet(req.address, 'orai');

    const { tokenSymbols } = req;

    tokenSymbols.forEach((symbol: string) => {
      const token = cosmosish.getTokenForSymbol(symbol);

      if (!token) {
        throw new HttpException(
          500,
          TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + symbol,
          TOKEN_NOT_SUPPORTED_ERROR_CODE
        );
      }
    });

    const balances = await cosmosish.getBalances(wallet);
    const filteredBalances = toCosmosBalances(balances, tokenSymbols);

    return {
      balances: filteredBalances,
    };
  }

  static async poll(cosmos: Oraichain, req: CosmosPollRequest) {
    validateCosmosPollRequest(req);

    const transaction = await cosmos.getTransaction(req.txHash);
    const currentBlock = await cosmos.getCurrentBlockNumber();

    return {
      txHash: req.txHash,
      currentBlock,
      txBlock: transaction.height,
      gasUsed: transaction.gasUsed,
      gasWanted: transaction.gasWanted,
      txData: decodeTxRaw(transaction.tx),
    };
  }
}

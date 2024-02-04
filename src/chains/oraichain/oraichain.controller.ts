import { TokensRequest } from '../../network/network.requests';
import { TokenInfo, TokenValue, tokenValueToString } from '../../services/base';
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
import { BigNumber } from 'ethers';

export const toOraichainBalances = (
  balances: Record<string, TokenValue>,
  tokenSymbols: Array<string>
): Record<string, string> => {
  const walletBalances: Record<string, string> = {};

  tokenSymbols.forEach((symbol) => {
    let balance = '0.0';
    if (balances[symbol]) {
      balance = tokenValueToString(balances[symbol]);
    }

    walletBalances[symbol] = balance;
  });

  return walletBalances;
};

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

    let cw20Tokens: Token[] = [];

    tokenSymbols.forEach((symbol: string) => {
      const token = cosmosish.getTokenForSymbol(symbol);

      if (!token) {
        throw new HttpException(
          500,
          TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + symbol,
          TOKEN_NOT_SUPPORTED_ERROR_CODE
        );
      } else {
        if (token.address != 'orai' && !token.address.startsWith('ibc/')) {
          cw20Tokens.push(token);
        }
      }
    });

    const cw20Balances = await this.getTokensBalance(
      cosmosish,
      req.address,
      cw20Tokens
    );
    const denomBalances = await cosmosish.getBalances(wallet);
    const filteredBalances = toOraichainBalances(
      { ...denomBalances, ...cw20Balances },
      tokenSymbols
    );

    return {
      balances: filteredBalances,
    };
  }

  static async getTokensBalance(
    cosmosish: Oraichain,
    address: string,
    tokens: Token[]
  ): Promise<Record<string, TokenValue>> {
    const balances: Record<string, TokenValue> = {};

    await Promise.all(
      tokens.map(async (token: Token) => {
        try {
          let balance = await cosmosish.queryContractSmart(token.address, {
            balance: {
              address,
            },
          });
          balances[token.symbol] = {
            value: BigNumber.from(parseInt(balance.balance, 10)),
            decimals: cosmosish.getTokenDecimals(token),
          };
        } catch (err) {
          balances[token.symbol] = {
            value: BigNumber.from(parseInt('0', 10)),
            decimals: cosmosish.getTokenDecimals(token),
          };
        }
      })
    );

    return balances;
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
      events: transaction.events,
    };
  }
}

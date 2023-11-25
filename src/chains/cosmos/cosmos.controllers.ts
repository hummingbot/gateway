import { Cosmos } from './cosmos';
import { CosmosBalanceRequest, CosmosPollRequest } from './cosmos.requests';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
} from '../../services/error-handler';
import {
  validateCosmosBalanceRequest,
  validateCosmosPollRequest,
} from './cosmos.validators';
import { CosmosTokenValue, tokenValueToString } from './cosmos-base';

const { decodeTxRaw } = require('@cosmjs/proto-signing');

export const toCosmosBalances = (
  balances: Record<string, CosmosTokenValue>,
  tokenSymbols: Array<string>
): Record<string, string> => {
  const walletBalances: Record<string, string> = {};

  tokenSymbols.forEach((symbol) => {
    let balance = '0.0';

    if (balances[symbol]) {// && !balances[symbol].value.eq(0)) { // is check necessary here or filtered in client?
      balance = tokenValueToString(balances[symbol]);
    }

    walletBalances[symbol] = balance;
  });

  return walletBalances;
};

export class CosmosController {
  static async balances(cosmosish: Cosmos, req: CosmosBalanceRequest) {
    validateCosmosBalanceRequest(req);

    const wallet = await cosmosish.getWallet(req.address, 'cosmos');

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

  static async poll(cosmos: Cosmos, req: CosmosPollRequest) {
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

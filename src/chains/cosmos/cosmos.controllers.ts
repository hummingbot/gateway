import { decodeTxRaw } from '@cosmjs/proto-signing';

import { logger } from '../../services/logger';

import { Cosmos } from './cosmos';
import { CosmosTokenValue, tokenValueToString } from './cosmos-base';
import { CosmosBalanceRequest, CosmosPollRequest } from './cosmos.requests';

export const toCosmosBalances = (
  balances: Record<string, CosmosTokenValue>,
  tokenSymbols: Array<string>,
  manualTokensCheck: boolean = false, // send 0's when they send in exact tokens to check
): Record<string, number> => {
  const walletBalances: Record<string, number> = {};

  tokenSymbols.forEach((symbol) => {
    let balance = 0;
    if (balances[symbol]) {
      balance = Number(tokenValueToString(balances[symbol]));
      if (balance > 0 || manualTokensCheck) {
        walletBalances[symbol] = balance;
      }
    }
  });

  return walletBalances;
};

export class CosmosController {
  static async balances(cosmosish: Cosmos, req: CosmosBalanceRequest) {
    const wallet = await cosmosish.getWallet(req.address, 'cosmos');

    const { tokenSymbols } = req;

    tokenSymbols.forEach((symbol: string) => {
      const token = cosmosish.getTokenForSymbol(symbol);

      if (!token) {
        logger.error(`Cosmos:   Token not supported: ${symbol}.`);
      }
    });

    const balances = await cosmosish.getBalances(wallet);
    const filteredBalances = toCosmosBalances(balances, tokenSymbols);

    return {
      balances: filteredBalances,
    };
  }

  static async poll(cosmos: Cosmos, req: CosmosPollRequest) {
    const transaction = await cosmos.getTransaction(req.txHash!);
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

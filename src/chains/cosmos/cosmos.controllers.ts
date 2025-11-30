import { decodeTxRaw } from '@cosmjs/proto-signing';

import { logger } from '../../services/logger';

import { Cosmos } from './cosmos';
import { CosmosTokenValue, tokenValueToString } from './cosmos-base';
import { CosmosBalanceRequest, CosmosPollRequest } from './cosmos.requests';
import { CosmosAsset } from './cosmos.universaltypes';

export const toCosmosBalances = (
  balances: Record<string, CosmosTokenValue>,
  // tokenSymbols: Array<string>,
  tokenAssets: CosmosAsset[],
  manualTokensCheck: boolean = false, // send 0's when they send in exact tokens to check
): Record<string, number> => {
  const walletBalances: Record<string, number> = {};

  Object.keys(balances).forEach((key) => {
    const value: CosmosTokenValue = balances[key];
    const symbol = key;
    let balance = 0;
    const asset: CosmosAsset = tokenAssets.find((ast) => {
      return [ast.symbol, ast.address, ast.base].includes(key); // filter out all by gamm/pool/ID values returned by balances()
    });
    if (asset) {
      key = asset.symbol;
    }
    balance = Number(tokenValueToString(value));
    if (balance > 0 || manualTokensCheck) {
      walletBalances[symbol] = balance;
    }
  });
  return walletBalances;
};

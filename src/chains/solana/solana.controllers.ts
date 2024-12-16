// import { tokenValueToString } from '../../services/base';
import { 
  BalanceRequest,
  TokensRequest,
  PollRequest,
} from '../../network/network.requests';
import { CustomTransactionResponse } from '../../services/common-interfaces';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from '../ethereum/ethereum-base';

import { Keypair, TransactionResponse } from '@solana/web3.js';
import { Solanaish } from './solana';
import { getNotNullOrThrowError } from './solana.helpers';

export class SolanaController {
  
  static async balances(solanaish: Solanaish, req: BalanceRequest) {
    let wallet: Keypair;
    try {
      wallet = await solanaish.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    const balances = await solanaish.getBalance(wallet, req.tokenSymbols);

    return { balances };
  }

  static async poll(solanaish: Solanaish, req: PollRequest) {
    const currentBlock = await solanaish.getCurrentBlockNumber();
    const txData = getNotNullOrThrowError<TransactionResponse>(
      await solanaish.getTransaction(req.txHash as any)
    );
    const txStatus = await solanaish.getTransactionStatusCode(txData);

    return {
      currentBlock: currentBlock,
      txHash: req.txHash,
      txBlock: txData.slot,
      txStatus: txStatus,
      txData: txData as unknown as CustomTransactionResponse | null,
    };
  }

  static async getTokens(solanaish: Solanaish, req: TokensRequest) {
    let tokens: TokenInfo[] = [];

    if (!req.tokenSymbols) {
      tokens = solanaish.storedTokenList;
    } else {
      for (const symbol of req.tokenSymbols as string[]) {
        const token = solanaish.getTokenBySymbol(symbol);
        if (token) {
          tokens.push(token);
        }
      }
    }

    return { tokens };
  }
}

export const balances = SolanaController.balances;
export const poll = SolanaController.poll;
export const getTokens = SolanaController.getTokens;
export let priorityFeeMultiplier: number = 1;

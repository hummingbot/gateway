import { 
  BalanceRequest,
  TokensRequest,
  PollRequest,
} from '../../chains/chain.requests';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from '../ethereum/ethereum-base';
import { Keypair } from '@solana/web3.js';
import { Solanaish } from './solana';
import { logger } from '../../services/logger';

interface FeeInfo {
  baseFee: number;
  priorityFee: number;
  totalFee: number;
}

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
    const txData = await solanaish.getTransaction(req.txHash as any);
    
    if (!txData) {
      return {
        currentBlock,
        txHash: req.txHash,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
      };
    }

    const txStatus = await solanaish.getTransactionStatusCode(txData as any);
    
    // Get both balanceChange and fee for account index 0 (transaction signer)
    const { balanceChange, fee } = await solanaish.extractAccountBalanceChangeAndFee(req.txHash, 0);

    logger.info(`Polling for transaction ${req.txHash}, Status: ${txStatus}, Balance Change: ${balanceChange} SOL, Fee: ${fee} SOL`);

    return {
      currentBlock,
      txHash: req.txHash,
      txBlock: txData.slot,
      txStatus,
      fee: fee,
      txData,
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

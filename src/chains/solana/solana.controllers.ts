import { 
  BalanceRequest,
  TokensRequest,
  PollRequest,
  StatusRequest,
} from './solana.routes';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from '../ethereum/ethereum-base';
import { Keypair } from '@solana/web3.js';
import { Solana } from './solana';
import { logger } from '../../services/logger';
import { wrapResponse } from '../../services/response-wrapper';

export class SolanaController {
  
  static async balances(solana: Solana, req: BalanceRequest) {
    const initTime = Date.now();
    let wallet: Keypair;
    try {
      wallet = await solana.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    const balances = await solana.getBalance(wallet, req.tokenSymbols);
    return wrapResponse({ balances }, initTime);
  }

  static async poll(solana: Solana, req: PollRequest) {
    const initTime = Date.now();
    const currentBlock = await solana.getCurrentBlockNumber();
    const txData = await solana.getTransaction(req.txHash as any);
    
    if (!txData) {
      return wrapResponse({
        currentBlock,
        txHash: req.txHash,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
      }, initTime);
    }

    const txStatus = await solana.getTransactionStatusCode(txData as any);
    const { balanceChange, fee } = await solana.extractAccountBalanceChangeAndFee(req.txHash, 0);

    logger.info(`Polling for transaction ${req.txHash}, Status: ${txStatus}, Balance Change: ${balanceChange} SOL, Fee: ${fee} SOL`);

    return wrapResponse({
      currentBlock,
      txHash: req.txHash,
      txBlock: txData.slot,
      txStatus,
      fee: fee,
      txData,
    }, initTime);
  }

  static async getTokens(solana: Solana, req: TokensRequest) {
    const initTime = Date.now();
    let tokens: TokenInfo[] = [];

    if (!req.tokenSymbols) {
      tokens = solana.storedTokenList;
    } else {
      const symbolsArray = Array.isArray(req.tokenSymbols) 
        ? req.tokenSymbols 
        : typeof req.tokenSymbols === 'string'
          ? (req.tokenSymbols as string).replace(/[\[\]]/g, '').split(',')
          : [];
          
      for (const symbol of symbolsArray) {
        const token = solana.getTokenBySymbol(symbol.trim());
        if (token) tokens.push(token);
      }
    }

    return wrapResponse({ tokens: tokens }, initTime);
  }

  static async getStatus(solana: Solana, req: StatusRequest) {
    const initTime = Date.now();
    const chain = 'solana';
    const network = solana.network;
    const rpcUrl = solana.config.network.nodeURL;
    const nativeCurrency = solana.config.network.nativeCurrencySymbol;
    const currentBlockNumber = await solana.getCurrentBlockNumber();

    return wrapResponse({
      chain,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency,
      timestamp: initTime,
      latency: Date.now() - initTime,
    }, initTime);
  }
}

import { 
  BalanceRequest,
  TokensRequest,
  PollRequest,
  StatusRequest,
  StatusResponse,
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
import { wrapResponse } from '../../services/response-wrapper';

export class SolanaController {
  
  static async balances(solanaish: Solanaish, req: BalanceRequest) {
    const initTime = Date.now();
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
    return wrapResponse({ balances }, initTime);
  }

  static async poll(solanaish: Solanaish, req: PollRequest) {
    const initTime = Date.now();
    const currentBlock = await solanaish.getCurrentBlockNumber();
    const txData = await solanaish.getTransaction(req.txHash as any);
    
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

    const txStatus = await solanaish.getTransactionStatusCode(txData as any);
    const { balanceChange, fee } = await solanaish.extractAccountBalanceChangeAndFee(req.txHash, 0);

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

  static async getTokens(solanaish: Solanaish, req: TokensRequest) {
    const initTime = Date.now();
    let tokens: TokenInfo[] = [];

    if (!req.tokenSymbols) {
      tokens = solanaish.storedTokenList;
    } else {
      const symbolsArray = Array.isArray(req.tokenSymbols) 
        ? req.tokenSymbols 
        : typeof req.tokenSymbols === 'string'
          ? (req.tokenSymbols as string).replace(/[\[\]]/g, '').split(',')
          : [];
          
      for (const symbol of symbolsArray) {
        const token = solanaish.getTokenBySymbol(symbol.trim());
        if (token) tokens.push(token);
      }
    }

    return wrapResponse({ tokens }, initTime);
  }

  static async getStatus(solanaish: Solanaish, req: StatusRequest): Promise<StatusResponse> {
    const initTime = Date.now();
    const chain = 'solana';
    const network = solanaish.network;
    const rpcUrl = solanaish.rpcUrl;
    const nativeCurrency = solanaish.nativeTokenSymbol;
    const currentBlockNumber = await solanaish.getCurrentBlockNumber();

    return wrapResponse({
      chain,
      chainId: undefined,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency,
      timestamp: initTime,
      latency: Date.now() - initTime,
    }, initTime);
  }
}

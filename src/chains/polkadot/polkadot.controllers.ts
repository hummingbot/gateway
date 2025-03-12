import {
  BalanceRequest,
  TokensRequest,
  PollRequest,
  StatusRequest,
  StakingRequest,
  TransferRequest,
  MetadataRequest
} from './polkadot.routes';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from '../ethereum/ethereum-base';
import { logger } from '../../services/logger';
import { wrapResponse } from '../../services/response-wrapper';
import { Polkadot } from './polkadot';
import { TransactionStatus } from './polkadot.types';

export class PolkadotController {
  
  /**
   * Get balances for an address
   * @param polkadot The Polkadot instance
   * @param req The balance request
   * @returns A wrapped response with balances
   */
  static async balances(polkadot: Polkadot, req: BalanceRequest) {
    const initTime = Date.now();
    let wallet;
    
    try {
      wallet = await polkadot.getWallet(req.address);
    } catch (err) {
      throw new HttpException(
        500,
        LOAD_WALLET_ERROR_MESSAGE + err,
        LOAD_WALLET_ERROR_CODE
      );
    }

    const balances = await polkadot.getBalance(wallet, req.tokenSymbols);
    return wrapResponse({ balances }, initTime);
  }

  /**
   * Poll for transaction status
   * @param polkadot The Polkadot instance
   * @param req The poll request
   * @returns A wrapped response with transaction status
   */
  static async poll(polkadot: Polkadot, req: PollRequest) {
    const initTime = Date.now();
    
    try {
      const currentBlock = await polkadot.getCurrentBlockNumber();
      
      // Validate transaction hash format
      if (!req.txHash || typeof req.txHash !== 'string' || !req.txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
        return wrapResponse({
          currentBlock,
          txHash: req.txHash,
          txBlock: null,
          txStatus: 0,
          txData: null,
          fee: null,
          error: "Invalid transaction hash format"
        }, initTime);
      }
      
      const txData = await polkadot.getTransaction(req.txHash);
      
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

      const txStatus = await polkadot.getTransactionStatusCode(txData);
      
      // Get fee and balance change if transaction is successful
      let fee = null;
      let balanceChange = null;
      
      if (txStatus === TransactionStatus.SUCCESS && req.address) {
        try {
          const result = await polkadot.extractBalanceChangeAndFee(req.txHash, req.address);
          fee = result.fee;
          balanceChange = result.balanceChange;
        } catch (error) {
          logger.error(`Error extracting fee and balance change: ${error.message}`);
        }
      }

      logger.info(`Polling for transaction ${req.txHash}, Status: ${txStatus}, Fee: ${fee || 'Unknown'}`);

      return wrapResponse({
        currentBlock,
        txHash: req.txHash,
        txBlock: txData.blockNumber,
        txStatus,
        fee,
        txData,
        balanceChange
      }, initTime);
    } catch (error) {
      logger.error(`Error polling transaction ${req.txHash}: ${error.message}`);
      return wrapResponse({
        currentBlock: await polkadot.getCurrentBlockNumber(),
        txHash: req.txHash,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
        error: "Transaction not found or invalid"
      }, initTime);
    }
  }

  /**
   * Get tokens
   * @param polkadot The Polkadot instance
   * @param req The tokens request
   * @returns A wrapped response with tokens
   */
  static async getTokens(polkadot: Polkadot, req: TokensRequest) {
    const initTime = Date.now();
    let tokens: TokenInfo[] = [];

    if (!req.tokenSymbols) {
      tokens = polkadot.tokenList;
    } else {
      const symbolsArray = Array.isArray(req.tokenSymbols) 
        ? req.tokenSymbols 
        : typeof req.tokenSymbols === 'string'
          ? (req.tokenSymbols as string).replace(/[\[\]]/g, '').split(',')
          : [];
          
      for (const symbol of symbolsArray) {
        const token = await polkadot.getToken(symbol.trim());
        if (token) tokens.push(token);
      }
    }

    return wrapResponse({ tokens }, initTime);
  }

  /**
   * Get network status
   * @param polkadot The Polkadot instance
   * @param _req The status request
   * @returns A wrapped response with network status
   */
  static async getStatus(polkadot: Polkadot, _req: StatusRequest) {
    const initTime = Date.now();
    const chain = 'polkadot';
    const network = polkadot.network;
    const rpcUrl = polkadot.config.network.nodeURL;
    const nativeCurrency = polkadot.config.network.nativeCurrencySymbol;
    const currentBlockNumber = await polkadot.getCurrentBlockNumber();

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

  /**
   * Get staking information
   * @param polkadot The Polkadot instance
   * @param req The staking request
   * @returns A wrapped response with staking information
   */
  static async getStakingInfo(polkadot: Polkadot, req: StakingRequest) {
    const initTime = Date.now();
    
    try {
      const stakingInfo = await polkadot.getStakingInfo(req.address);
      
      return wrapResponse({
        address: req.address,
        stakingInfo,
        timestamp: initTime,
        latency: Date.now() - initTime,
      }, initTime);
    } catch (error) {
      logger.error(`Error getting staking info: ${error.message}`);
      throw new HttpException(
        500,
        `Failed to get staking info: ${error.message}`,
        'STAKING_INFO_ERROR'
      );
    }
  }

  /**
   * Transfer tokens
   * @param polkadot The Polkadot instance
   * @param req The transfer request
   * @returns A wrapped response with transaction receipt
   */
  static async transfer(polkadot: Polkadot, req: TransferRequest) {
    const initTime = Date.now();
    
    try {
      // Validate parameters
      if (!req.fromAddress || !req.toAddress || !req.amount || !req.tokenSymbol) {
        throw new HttpException(
          400,
          'Missing required parameters',
          'MISSING_PARAMETERS'
        );
      }
      
      // Get wallet
      const wallet = await polkadot.getWallet(req.fromAddress);
      
      // Perform transfer
      const receipt = await polkadot.transfer(
        wallet,
        req.toAddress,
        req.amount,
        req.tokenSymbol,
        {
          tip: req.tip,
          keepAlive: req.keepAlive,
          waitForFinalization: req.waitForFinalization
        }
      );
      
      return wrapResponse({
        txHash: receipt.transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        fee: receipt.fee,
        timestamp: initTime,
        latency: Date.now() - initTime,
      }, initTime);
    } catch (error) {
      logger.error(`Error transferring tokens: ${error.message}`);
      throw new HttpException(
        500,
        `Failed to transfer tokens: ${error.message}`,
        'TRANSFER_ERROR'
      );
    }
  }

  /**
   * Get blockchain metadata
   * @param polkadot The Polkadot instance
   * @param req The metadata request
   * @returns A wrapped response with blockchain metadata
   */
  static async getMetadata(polkadot: Polkadot, req: MetadataRequest) {
    const initTime = Date.now();
    
    try {
      const metadata = await polkadot.getPalletMetadata(req.palletName);
      
      return wrapResponse({
        palletName: req.palletName,
        metadata,
        timestamp: initTime,
        latency: Date.now() - initTime,
      }, initTime);
    } catch (error) {
      logger.error(`Error getting metadata: ${error.message}`);
      throw new HttpException(
        500,
        `Failed to get metadata: ${error.message}`,
        'METADATA_ERROR'
      );
    }
  }
}


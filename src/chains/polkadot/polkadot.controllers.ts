import {
  BalanceRequest,
  TokensRequest,
  PollRequest,
  StatusRequest,
  StakingRequest,
  TransferRequest,
  MetadataRequest,
  PollResponse
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
  // In polkadot.controllers.ts - poll method
public static async poll(chain: Polkadot, req: PollRequest): Promise<PollResponse> {
  const startTime = Date.now();
  
  try {
    // Get the transaction details
    const txResult = await chain.getTransaction(req.txHash);
    
    // Create the response with ALL fields
    return {
      network: chain.network,
      currentBlock: await chain.getCurrentBlockNumber(),
      txHash: req.txHash,
      txBlock: txResult.txBlock,  // Make sure this is included!
      txStatus: txResult.txStatus, // Make sure this is included!
      txData: txResult.txData,
      fee: txResult.fee,
      timestamp: Date.now(),
      latency: (Date.now() - startTime) / 1000
    };
  } catch (error) {
    logger.error(`Error in poll: ${error.message}`);
    const currentBlock = await chain.getCurrentBlockNumber();
    
    return {
      network: chain.network,
      currentBlock,
      txHash: req.txHash,
      txBlock: currentBlock,  // Provide a fallback
      txStatus: 0,  // Explicitly set status for error case
      txData: {},
      fee: null,
      timestamp: Date.now(),
      latency: (Date.now() - startTime) / 1000
    };
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
        5001
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
          4001
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
        5002
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
        5003
      );
    }
  }
}


import {
  BalanceRequestType,
  TokensRequestType,
  PollRequestType,
  StatusRequestType,
  BalanceResponseType,
  TokensResponseType,
  PollResponseType,
  StatusResponseType
} from '../../schemas/chain-schema';
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
} from '../../services/error-handler';
import { TokenInfo } from '../ethereum/ethereum-base';
import { logger } from '../../services/logger';
import { wrapResponse } from '../../services/response-wrapper';
import { Polkadot } from './polkadot';

export class PolkadotController {



  /**
   * Get balances for an address
   * @param polkadot The Polkadot instance
   * @param req The balance request
   * @returns A wrapped response with balances
   */
  static async balances(polkadot: Polkadot, req: BalanceRequestType): Promise<BalanceResponseType> {
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

  
  public static async poll(chain: Polkadot, req: PollRequestType): Promise<PollResponseType> {
    try {
      // Get the transaction details
      const txResult = await chain.getTransaction(req.txHash);
      
      return {
        currentBlock: await chain.getCurrentBlockNumber(),
        txHash: req.txHash,
        txBlock: txResult.txBlock,
        txStatus: txResult.txStatus,
        txData: txResult.txData,
        fee: txResult.fee
      };
    } catch (error) {
      logger.error(`Error in poll: ${error.message}`);
      const currentBlock = await chain.getCurrentBlockNumber();
      
      return {
        currentBlock,
        txHash: req.txHash,
        txBlock: currentBlock,
        txStatus: 0,
        txData: {},
        fee: null
      };
    }
  }

  /**
   * Get tokens
   * @param polkadot The Polkadot instance
   * @param req The tokens request
   * @returns A wrapped response with tokens
   */
  static async getTokens(polkadot: Polkadot, req: TokensRequestType): Promise<TokensResponseType> {
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

  static async getStatus(polkadot: Polkadot, _req: StatusRequestType): Promise<StatusResponseType> {
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
      nativeCurrency
    }, initTime);
  }

  /**
   * Get staking information
   * @param polkadot The Polkadot instance
   * @param req The staking request
   * @returns A wrapped response with staking information
   */

  static async getStakingInfo(polkadot: Polkadot, req: BalanceRequestType): Promise<BalanceResponseType> {
    const initTime = Date.now();
    
    try {
      const stakingInfo = await polkadot.getStakingInfo(req.address);
      
      return wrapResponse({
        balances: {
          staked: Number(stakingInfo.totalStake),
          own: Number(stakingInfo.ownStake)
        }
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
  static async transfer(polkadot: Polkadot, req: BalanceRequestType): Promise<BalanceResponseType> {
    const initTime = Date.now();
    
    try {
      // Validate parameters
      if (!req.address || !req.tokenSymbols) {
        throw new HttpException(
          400,
          'Missing required parameters',
          4001
        );
      }

      // Get wallet
      const wallet = await polkadot.getWallet(req.address);
      
      // Perform transfer
      const receipt = await polkadot.transfer(
        wallet,
        req.address,
        0, // Default amount
        req.tokenSymbols[0]
      );
      
      return wrapResponse({
        balances: {
          [req.tokenSymbols[0]]: Number(receipt.status)
        }
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
   * @param _req The metadata request
   * @returns A wrapped response with blockchain metadata
   */
  static async getMetadata(polkadot: Polkadot, _req: StatusRequestType): Promise<StatusResponseType> {
    const initTime = Date.now();
    
    try {
      await polkadot.getPalletMetadata('system');
    
        return wrapResponse({
        chain: 'polkadot',
        network: polkadot.network,
        rpcUrl: polkadot.config.network.nodeURL,
        currentBlockNumber: await polkadot.getCurrentBlockNumber(),
        nativeCurrency: polkadot.config.network.nativeCurrencySymbol
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


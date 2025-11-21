import axios from 'axios';

import { logger } from '../../services/logger';

/**
 * Etherscan transaction list API response
 */
interface EtherscanTxListResponse {
  status: string;
  message: string;
  result: Array<{
    blockNumber: string;
    blockHash: string;
    timeStamp: string;
    hash: string;
    nonce: string;
    transactionIndex: string;
    from: string;
    to: string;
    value: string;
    gas: string;
    gasPrice: string;
    gasUsed: string;
    cumulativeGasUsed: string;
    input: string;
    methodId: string;
    functionName: string;
    contractAddress: string;
    confirmations: string;
    txreceipt_status: string;
    isError: string;
  }>;
}

/**
 * Transaction data returned by getTransactions
 */
export interface EtherscanTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: any | null;
  memo: string | null;
  confirmationStatus: string | null;
}

/**
 * Etherscan gas oracle API response
 */
interface EtherscanGasOracleResponse {
  status: string;
  message: string;
  result: {
    LastBlock: string;
    SafeGasPrice: string;
    ProposeGasPrice: string;
    FastGasPrice: string;
    suggestBaseFee: string;
    gasUsedRatio: string;
  };
}

/**
 * Gas prices returned by getGasOracle
 */
export interface EtherscanGasPrices {
  baseFee: number;
  priorityFeeSafe: number;
  priorityFeePropose: number;
  priorityFeeFast: number;
}

/**
 * Recommended gas prices for transactions
 */
export interface RecommendedGasPrices {
  maxPriorityFeePerGas: number;
  maxFeePerGas: number;
}

/**
 * Service for fetching transaction history from Etherscan V2 API
 * Uses unified endpoint with chainid parameter
 * Supports all chains listed at: https://docs.etherscan.io/supported-chains
 */
export class EtherscanService {
  private apiKey: string;
  private chainId: number;
  private network: string;
  private static readonly BASE_URL = 'https://api.etherscan.io/v2/api';

  // Supported chain IDs for Etherscan API
  private static readonly SUPPORTED_CHAIN_IDS = new Set([
    1, // Ethereum
    56, // BSC
    137, // Polygon
  ]);

  constructor(chainId: number, network: string, apiKey: string) {
    if (!EtherscanService.isSupported(chainId)) {
      throw new Error(`Etherscan API not supported for chainId: ${chainId}`);
    }
    this.network = network;
    this.apiKey = apiKey;
    this.chainId = chainId;
  }

  /**
   * Check if a chain ID is supported by Etherscan API
   * @param chainId Chain ID to check
   * @returns True if supported, false otherwise
   */
  public static isSupported(chainId: number): boolean {
    return EtherscanService.SUPPORTED_CHAIN_IDS.has(chainId);
  }

  /**
   * Fetch transaction history for an address using Etherscan txlist endpoint
   * @param address Wallet address to fetch transactions for
   * @param limit Maximum number of transactions to return (default: 100, max: 10000)
   * @returns Array of transaction signatures with metadata
   */
  public async getTransactions(address: string, limit: number = 100): Promise<EtherscanTransaction[]> {
    try {
      // Etherscan txlist supports up to 10000 transactions per request
      const offset = Math.min(limit, 10000);

      const params = {
        chainid: this.chainId,
        module: 'account',
        action: 'txlist',
        address,
        startblock: 0,
        endblock: 99999999,
        page: 1,
        offset,
        sort: 'desc', // Latest first
        apikey: this.apiKey,
      };

      logger.debug(
        `Fetching transactions from Etherscan V2 API for address ${address} on ${this.network} (chainId: ${this.chainId})`,
      );

      const response = await axios.get<EtherscanTxListResponse>(EtherscanService.BASE_URL, {
        params,
        timeout: 10000, // Increased timeout for transaction list
      });

      if (response.data.status !== '1') {
        const errorMsg = response.data.message;
        const errorResult =
          typeof response.data.result === 'string' ? response.data.result : JSON.stringify(response.data.result);
        const fullError = errorResult || errorMsg;
        const isRateLimit = fullError.includes('rate limit') || fullError.includes('Max rate limit');

        logger.error(
          `Etherscan API returned error for ${this.network} (chainId: ${this.chainId}): status=${response.data.status}, message=${errorMsg}, result=${errorResult}`,
        );

        if (isRateLimit) {
          throw new Error(
            `Etherscan API rate limit exceeded: ${fullError}. ` +
              `Free tier: 5 requests/second. See https://docs.etherscan.io/resources/rate-limits for upgrade options.`,
          );
        }

        // Use result field as it contains the detailed error message
        throw new Error(fullError);
      }

      const transactions: EtherscanTransaction[] = response.data.result.map((tx) => ({
        signature: tx.hash,
        slot: parseInt(tx.blockNumber),
        blockTime: parseInt(tx.timeStamp),
        err: tx.isError === '1' || tx.txreceipt_status === '0' ? { error: 'Transaction failed' } : null,
        memo: tx.functionName || null,
        confirmationStatus: parseInt(tx.confirmations) > 0 ? 'confirmed' : 'pending',
      }));

      logger.info(`Fetched ${transactions.length} transactions for ${address} on ${this.network} from Etherscan`);

      return transactions;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid Etherscan API key');
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error('Etherscan API request timeout');
      }
      throw new Error(`Failed to fetch transactions from Etherscan: ${error.message}`);
    }
  }

  /**
   * Fetch gas prices from Etherscan Gas Oracle
   * @returns Gas prices including base fee and priority fees
   */
  public async getGasOracle(): Promise<EtherscanGasPrices> {
    try {
      const params = {
        chainid: this.chainId,
        module: 'gastracker',
        action: 'gasoracle',
        apikey: this.apiKey,
      };

      logger.debug(`Fetching gas oracle data from Etherscan for ${this.network} (chainId: ${this.chainId})`);

      const response = await axios.get<EtherscanGasOracleResponse>(EtherscanService.BASE_URL, {
        params,
        timeout: 5000,
      });

      if (response.data.status !== '1') {
        throw new Error(`Etherscan API error: ${response.data.message}`);
      }

      const result = response.data.result;
      return {
        baseFee: parseFloat(result.suggestBaseFee),
        priorityFeeSafe: parseFloat(result.SafeGasPrice),
        priorityFeePropose: parseFloat(result.ProposeGasPrice),
        priorityFeeFast: parseFloat(result.FastGasPrice),
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid Etherscan API key');
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error('Etherscan API request timeout');
      }
      throw new Error(`Failed to fetch gas data from Etherscan: ${error.message}`);
    }
  }

  /**
   * Get recommended gas prices for a transaction
   * @param speed Transaction speed: 'safe' (slow), 'propose' (average), or 'fast'
   * @returns Recommended maxPriorityFeePerGas and maxFeePerGas
   */
  public async getRecommendedGasPrices(speed: 'safe' | 'propose' | 'fast' = 'propose'): Promise<RecommendedGasPrices> {
    const gasPrices = await this.getGasOracle();

    let priorityFee: number;
    switch (speed) {
      case 'safe':
        priorityFee = gasPrices.priorityFeeSafe;
        break;
      case 'fast':
        priorityFee = gasPrices.priorityFeeFast;
        break;
      case 'propose':
      default:
        priorityFee = gasPrices.priorityFeePropose;
        break;
    }

    // EIP-1559: maxFeePerGas = baseFee * 2 + maxPriorityFeePerGas
    const maxFeePerGas = gasPrices.baseFee * 2 + priorityFee;

    return {
      maxPriorityFeePerGas: priorityFee,
      maxFeePerGas,
    };
  }
}

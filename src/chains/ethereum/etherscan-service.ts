import axios from 'axios';

import { logger } from '../../services/logger';

/**
 * Etherscan Gas Tracker API response
 */
interface EtherscanGasOracleResponse {
  status: string;
  message: string;
  result: {
    LastBlock: string;
    SafeGasPrice: string; // Priority fee for safe/slow speed
    ProposeGasPrice: string; // Priority fee for average speed
    FastGasPrice: string; // Priority fee for fast speed
    suggestBaseFee: string; // Suggested base fee for next block
    gasUsedRatio: string; // Network congestion indicator
  };
}

/**
 * Gas price data from Etherscan
 */
export interface EtherscanGasData {
  baseFee: number; // in GWEI
  priorityFeeSafe: number; // in GWEI
  priorityFeePropose: number; // in GWEI
  priorityFeeFast: number; // in GWEI
}

/**
 * Service for fetching gas prices from Etherscan V2 API
 * Uses unified endpoint with chainid parameter
 * Supports all chains listed at: https://docs.etherscan.io/supported-chains
 */
export class EtherscanService {
  private apiKey: string;
  private chainId: number;
  private network: string;
  private static readonly BASE_URL = 'https://api.etherscan.io/v2/api';

  // List of chain IDs that support the gastracker module
  // Note: Not all Etherscan V2 supported chains have gastracker available
  // These chains were tested and confirmed to support the gastracker module
  private static readonly SUPPORTED_CHAIN_IDS = new Set([
    1, // Ethereum Mainnet - CONFIRMED
    11155111, // Sepolia Testnet
    137, // Polygon Mainnet - CONFIRMED
    80002, // Polygon Amoy Testnet
    56, // BNB Smart Chain Mainnet - CONFIRMED
    97, // BNB Smart Chain Testnet
    43114, // Avalanche C-Chain
    43113, // Avalanche Fuji
    // Note: Base, Arbitrum, Optimism do NOT support gastracker module
  ]);

  constructor(chainId: number, network: string, apiKey: string) {
    this.network = network;
    this.apiKey = apiKey;
    this.chainId = chainId;

    if (!EtherscanService.SUPPORTED_CHAIN_IDS.has(chainId)) {
      throw new Error(`Etherscan API not supported for chainId: ${chainId}`);
    }
  }

  /**
   * Check if Etherscan API is supported for the given chain ID
   */
  public static isSupported(chainId: number): boolean {
    return EtherscanService.SUPPORTED_CHAIN_IDS.has(chainId);
  }

  /**
   * Fetch current gas prices from Etherscan Gas Tracker API V2
   * Returns base fee and priority fees (safe, propose, fast)
   */
  public async getGasOracle(): Promise<EtherscanGasData> {
    try {
      const params = {
        chainid: this.chainId,
        module: 'gastracker',
        action: 'gasoracle',
        apikey: this.apiKey,
      };

      logger.debug(
        `Fetching gas prices from Etherscan V2 API for ${this.network} (chainId: ${this.chainId}) - URL: ${EtherscanService.BASE_URL}`,
      );
      logger.debug(
        `Request params: ${JSON.stringify({ chainid: this.chainId, module: 'gastracker', action: 'gasoracle', apikey: '***' })}`,
      );

      const response = await axios.get<EtherscanGasOracleResponse>(EtherscanService.BASE_URL, {
        params,
        timeout: 5000,
      });

      if (response.data.status !== '1') {
        throw new Error(
          `Etherscan API error: ${response.data.message} (result: ${JSON.stringify(response.data.result || 'none')})`,
        );
      }

      const result = response.data.result;

      // Parse gas prices (all in GWEI)
      const gasData: EtherscanGasData = {
        baseFee: parseFloat(result.suggestBaseFee),
        priorityFeeSafe: parseFloat(result.SafeGasPrice),
        priorityFeePropose: parseFloat(result.ProposeGasPrice),
        priorityFeeFast: parseFloat(result.FastGasPrice),
      };

      logger.info(
        `Etherscan ${this.network}: baseFee=${gasData.baseFee.toFixed(4)} GWEI, ` +
          `priority (safe/propose/fast)=${gasData.priorityFeeSafe}/${gasData.priorityFeePropose}/${gasData.priorityFeeFast} GWEI`,
      );

      return gasData;
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
   * @param speed 'safe' | 'propose' | 'fast' - default is 'propose' (average)
   * @returns Object with maxFeePerGas and maxPriorityFeePerGas in GWEI
   */
  public async getRecommendedGasPrices(
    speed: 'safe' | 'propose' | 'fast' = 'propose',
  ): Promise<{ maxFeePerGas: number; maxPriorityFeePerGas: number }> {
    const gasData = await this.getGasOracle();

    // Select priority fee based on speed
    let priorityFee: number;
    switch (speed) {
      case 'safe':
        priorityFee = gasData.priorityFeeSafe;
        break;
      case 'fast':
        priorityFee = gasData.priorityFeeFast;
        break;
      case 'propose':
      default:
        priorityFee = gasData.priorityFeePropose;
        break;
    }

    // Calculate maxFeePerGas = baseFee * 2 + priorityFee
    // This allows for base fee to potentially double before the tx becomes invalid
    const maxFeePerGas = gasData.baseFee * 2 + priorityFee;

    return {
      maxFeePerGas,
      maxPriorityFeePerGas: priorityFee,
    };
  }
}

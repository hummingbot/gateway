import { VersionedTransaction } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { getSolanaNetworkConfig } from '../../chains/solana/solana.config';
import { createHttpClient, HttpClient, HttpClientError } from '../../services/http-client';
import { logger } from '../../services/logger';

import { DFlowConfig } from './dflow.config';

// DFlow Swap API base URLs (https://pond.dflow.net/resources/trading-api/introduction)
// Production requires an x-api-key; the dev endpoint is keyless but rate-limited and
// not suitable for production use.
const DFLOW_API_BASE = 'https://quote-api.dflow.net';
const DFLOW_API_BASE_DEV = 'https://dev-quote-api.dflow.net';

// Type definitions for DFlow API responses (Jupiter-compatible quote shape)
export interface DFlowQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  minOutAmount?: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
  contextSlot?: number;
  requestId?: string;
}

interface DFlowSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
}

export class DFlow {
  private static _instances: { [name: string]: DFlow };
  private solana: Solana;
  public config: DFlowConfig.RootConfig;
  private httpClient: HttpClient;

  private constructor() {
    this.config = DFlowConfig.config;
    this.solana = null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let baseURL: string;

    // Use the production API with an x-api-key, or the keyless dev endpoint without one
    if (this.config.apiKey && this.config.apiKey.length > 0) {
      headers['x-api-key'] = this.config.apiKey;
      baseURL = DFLOW_API_BASE;
      logger.info('Using DFlow API with key');
    } else {
      baseURL = DFLOW_API_BASE_DEV;
      logger.warn(
        'No DFlow API key configured. Using dev-quote-api.dflow.net, which is rate-limited and ' +
          'not suitable for production. Apply for a key at https://pond.dflow.net/build/api-key ' +
          'and set dflow.apiKey in your config.',
      );
    }

    this.httpClient = createHttpClient({
      baseURL,
      timeout: 30000,
      headers,
    });
  }

  /**
   * Gets or creates a singleton instance of DFlow for the specified network
   */
  public static async getInstance(network: string): Promise<DFlow> {
    if (!DFlow._instances) {
      DFlow._instances = {};
    }
    if (!DFlow._instances[network]) {
      const instance = new DFlow();
      await instance.init(network);
      DFlow._instances[network] = instance;
    }
    return DFlow._instances[network];
  }

  private async init(network: string): Promise<void> {
    try {
      this.solana = await Solana.getInstance(network);
      logger.info('Initialized DFlow for network:', network);
    } catch (error) {
      logger.error('Failed to initialize DFlow:', error);
      throw error;
    }
  }

  /**
   * Gets an ExactIn swap quote from the DFlow API.
   * NOTE: DFlow is ExactIn-only. It silently ignores an unknown swapMode parameter and
   * quotes ExactIn anyway (verified against the live API), so no ExactOut mode is exposed —
   * BUY orders must go through the sell-leg approximation in quoteSwap.
   * @param inputMint Input token mint address
   * @param outputMint Output token mint address
   * @param amountRaw Input amount in smallest units
   * @param slippageBps Slippage tolerance in basis points
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amountRaw: string,
    slippageBps: number,
  ): Promise<DFlowQuoteResponse> {
    const params: Record<string, string> = {
      inputMint,
      outputMint,
      amount: amountRaw,
      slippageBps: slippageBps.toString(),
    };

    logger.info(`DFlow quote: ${inputMint} -> ${outputMint}, amountRaw=${amountRaw}, slippageBps=${slippageBps}`);

    try {
      const response = await this.httpClient.get<DFlowQuoteResponse>('/quote', { params });
      if (!response.data) {
        throw new Error('Unable to get quote - empty response');
      }
      return response.data;
    } catch (error) {
      if (error instanceof HttpClientError) {
        logger.error('DFlow API error:', error.message);
        const data = error.response?.data;
        if (data) {
          logger.error('DFlow API error response:', data);
          const apiMessage = typeof data === 'string' ? data : data.error || data.message || JSON.stringify(data);
          throw new Error(`DFlow API error: ${apiMessage}`);
        }
      }
      throw error;
    }
  }

  /**
   * Builds an UNSIGNED swap transaction from a DFlow quote. Signing and sending are handled
   * by the wallet-type-aware chokepoint (Solana.sendAndConfirmTransactionForWallet).
   */
  public async buildSwapTransactionUnsigned(
    walletAddress: string,
    quoteResponse: DFlowQuoteResponse,
  ): Promise<VersionedTransaction> {
    const swapRequest: Record<string, any> = {
      userPublicKey: walletAddress,
      quoteResponse,
      dynamicComputeUnitLimit: this.config.dynamicComputeUnitLimit,
    };
    if (this.config.computeUnitPriceMicroLamports > 0) {
      swapRequest.computeUnitPriceMicroLamports = Math.floor(this.config.computeUnitPriceMicroLamports);
    } else {
      swapRequest.prioritizationFeeLamports = 'auto';
    }

    const solanaConfig = getSolanaNetworkConfig(this.solana.network);
    const retryCount = solanaConfig.confirmRetryCount;
    const retryInterval = solanaConfig.confirmRetryInterval;

    let lastError: Error | null = null;
    let swapObj: DFlowSwapResponse;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const response = await this.httpClient.post<DFlowSwapResponse>('/swap', swapRequest);
        swapObj = response.data;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof HttpClientError) {
          logger.error(`Fetching DFlow swap object attempt ${attempt}/${retryCount} failed:`, {
            error: error.message,
            status: error.response?.status,
            data: error.response?.data,
          });
        } else {
          logger.error(`Fetching DFlow swap object attempt ${attempt}/${retryCount} failed:`, error);
        }

        if (attempt < retryCount) {
          logger.info(`Waiting ${retryInterval}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }
      }
    }

    if (!swapObj) {
      throw new Error(
        `Failed to fetch DFlow swap transaction after ${retryCount} attempts. Last error: ${lastError?.message}`,
      );
    }

    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
    return VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));
  }
}

import { Wallet } from '@coral-xyz/anchor';
import { VersionedTransaction } from '@solana/web3.js';
import axios, { AxiosInstance } from 'axios';

import { Solana } from '../../chains/solana/solana';
import { logger } from '../../services/logger';

import { JupiterConfig } from './jupiter.config';

const JUPITER_API_RETRY_COUNT = 5;
const JUPITER_API_RETRY_INTERVAL_MS = 1000;
export const DECIMAL_MULTIPLIER = 10;

// Jupiter API base URL
const JUPITER_API_BASE_FREE = 'https://lite-api.jup.ag';
const JUPITER_API_BASE_PAID = 'https://api.jup.ag';

// Type definitions for Jupiter API responses
interface QuoteResponse {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  otherAmountThreshold: string;
  slippageBps: number;
  swapMode: string;
  routePlan: any[];
  contextSlot: number;
  timeTaken: number;
}

interface SwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export class Jupiter {
  private static _instances: { [name: string]: Jupiter };
  private solana: Solana;
  public config: JupiterConfig.RootConfig;
  private httpClient: AxiosInstance;

  private constructor() {
    this.config = JupiterConfig.config;
    this.solana = null;

    // Initialize HTTP client with Jupiter API base URL
    const headers: any = {
      'Content-Type': 'application/json',
    };

    let baseURL = JUPITER_API_BASE_FREE;

    // Add API key header if provided and use paid endpoint
    if (this.config.apiKey && this.config.apiKey.length > 0) {
      headers['x-api-key'] = this.config.apiKey;
      baseURL = JUPITER_API_BASE_PAID;
      logger.info('Using Jupiter paid API with key');
    } else {
      logger.info('Using Jupiter free tier (no API key)');
    }

    this.httpClient = axios.create({
      baseURL,
      timeout: 30000,
      headers,
    });
  }

  public static async getInstance(network: string): Promise<Jupiter> {
    if (!Jupiter._instances) {
      Jupiter._instances = {};
    }
    if (!Jupiter._instances[network]) {
      const instance = new Jupiter();
      await instance.init(network);
      Jupiter._instances[network] = instance;
    }
    return Jupiter._instances[network];
  }

  private async init(network: string): Promise<void> {
    try {
      this.solana = await Solana.getInstance(network);
      logger.info('Initialized Jupiter for network:', network);
    } catch (error) {
      logger.error('Failed to initialize Jupiter:', error);
      throw error;
    }
  }

  /**
   * Gets the allowed slippage percentage from config
   * @returns Slippage as a percentage (e.g., 1.0 for 1%)
   */
  getSlippagePct(): number {
    return this.config.slippagePct;
  }

  async getQuote(
    inputTokenIdentifier: string,
    outputTokenIdentifier: string,
    amount: number,
    slippagePct?: number,
    onlyDirectRoutes: boolean = JupiterConfig.config.onlyDirectRoutes,
    restrictIntermediateTokens: boolean = JupiterConfig.config
      .restrictIntermediateTokens,
    swapMode: 'ExactIn' | 'ExactOut' = 'ExactIn',
  ): Promise<QuoteResponse> {
    const inputToken = await this.solana.getToken(inputTokenIdentifier);
    const outputToken = await this.solana.getToken(outputTokenIdentifier);

    if (!inputToken || !outputToken) {
      throw new Error(
        `Token not found: ${!inputToken ? inputTokenIdentifier : outputTokenIdentifier}`,
      );
    }

    const slippageBps = Math.round(
      (slippagePct ?? this.config.slippagePct) * 100,
    );
    const tokenDecimals =
      swapMode === 'ExactOut' ? outputToken.decimals : inputToken.decimals;
    const quoteAmount = Math.floor(amount * 10 ** tokenDecimals);

    // Build query parameters for the REST API
    const params = new URLSearchParams({
      inputMint: inputToken.address,
      outputMint: outputToken.address,
      amount: quoteAmount.toString(),
      slippageBps: slippageBps.toString(),
      swapMode: swapMode,
      onlyDirectRoutes: onlyDirectRoutes.toString(),
      restrictIntermediateTokens: restrictIntermediateTokens.toString(),
    });

    // Note: maxAccounts parameter has been deprecated

    logger.debug(
      `Getting Jupiter quote for ${inputToken.symbol} to ${outputToken.symbol} with params:`,
      Object.fromEntries(params),
    );

    try {
      const response = await this.httpClient.get('/swap/v1/quote', { params });
      const quote = response.data;

      if (!quote) {
        logger.error('Unable to get quote - empty response');
        throw new Error('Unable to get quote - empty response');
      }

      logger.debug('Got Jupiter quote:', quote);
      return quote;
    } catch (error: any) {
      logger.error('Jupiter API error:', error.message);
      if (error.response?.data) {
        logger.error('Jupiter API error response:', error.response.data);

        // Handle specific error messages
        if (typeof error.response.data === 'string') {
          if (error.response.data === 'Route not found') {
            if (swapMode === 'ExactOut') {
              throw new Error('ExactOut not supported for this token pair');
            } else {
              throw new Error('No route found for this token pair');
            }
          }
          throw new Error(`Jupiter API error: ${error.response.data}`);
        } else if (error.response.data.error) {
          throw new Error(`Jupiter API error: ${error.response.data.error}`);
        }
      }
      throw error;
    }
  }

  /**
   * Builds and prepares a swap transaction from a quote
   * @param wallet The wallet to use for signing
   * @param quote The quote response from Jupiter API
   * @param maxLamports Maximum priority fee in lamports (optional)
   * @param priorityLevel Priority level for transaction (optional)
   * @returns Prepared and simulated transaction ready for execution
   */
  public async buildSwapTransaction(
    wallet: Wallet,
    quote: QuoteResponse,
    maxLamports?: number,
    priorityLevel?: string,
  ): Promise<VersionedTransaction> {
    // Use provided values or fall back to config
    const feeLamports = maxLamports
      ? Math.floor(maxLamports)
      : Math.floor(this.config.maxLamports);
    const level = priorityLevel || this.config.priorityLevel;

    logger.info(
      `Sending swap with priority level ${level} and max ${feeLamports} lamports`,
    );

    // Get swap object from Jupiter API with retry logic
    let lastError: Error | null = null;
    let swapObj: SwapResponse;

    for (let attempt = 1; attempt <= JUPITER_API_RETRY_COUNT; attempt++) {
      try {
        const swapRequest = {
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toBase58(),
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: feeLamports,
              priorityLevel: level,
            },
          },
        };

        const response = await this.httpClient.post(
          '/swap/v1/swap',
          swapRequest,
        );
        swapObj = response.data;
        break; // Success, exit the retry loop
      } catch (error: any) {
        lastError = error;
        logger.error(
          `Fetching swap object attempt ${attempt}/${JUPITER_API_RETRY_COUNT} failed:`,
          error.response?.status
            ? {
                error: error.message,
                status: error.response.status,
                data: error.response.data,
              }
            : error,
        );

        if (attempt < JUPITER_API_RETRY_COUNT) {
          logger.info(
            `Waiting ${JUPITER_API_RETRY_INTERVAL_MS}ms before retry...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, JUPITER_API_RETRY_INTERVAL_MS),
          );
        }
      }
    }

    if (!swapObj) {
      throw new Error(
        `Failed to fetch swap route after ${JUPITER_API_RETRY_COUNT} attempts. Last error: ${lastError?.message}`,
      );
    }

    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(
      new Uint8Array(swapTransactionBuf),
    );

    // Sign and simulate the transaction
    transaction.sign([wallet.payer]);
    await this.solana.simulateTransaction(transaction);

    return transaction;
  }

  public static getRequestAmount(amount: number, decimals: number): number {
    return Math.floor(amount * DECIMAL_MULTIPLIER ** decimals);
  }
}

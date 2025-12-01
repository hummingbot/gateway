import { Wallet } from '@coral-xyz/anchor';
import { VersionedTransaction } from '@solana/web3.js';
import axios, { AxiosInstance } from 'axios';

import { Solana } from '../../chains/solana/solana';
import { getSolanaNetworkConfig } from '../../chains/solana/solana.config';
import { logger } from '../../services/logger';

import { JupiterConfig } from './jupiter.config';

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
    const headers: Record<string, string> = {
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

  /**
   * Gets or creates a singleton instance of Jupiter for the specified network
   * @param network The Solana network to connect to (e.g., 'mainnet-beta', 'devnet')
   * @returns Promise resolving to the Jupiter instance
   */
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

  /**
   * Initializes the Jupiter instance with the specified network
   * @param network The Solana network to connect to
   * @throws Error if initialization fails
   */
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
   * Gets a swap quote from Jupiter API for the specified token pair
   * @param inputTokenIdentifier The input token symbol or address
   * @param outputTokenIdentifier The output token symbol or address
   * @param amount The amount of tokens to swap (in human-readable format)
   * @param slippagePct Optional slippage percentage (e.g., 1 for 1%). Defaults to config value
   * @param onlyDirectRoutes Whether to only use direct routes. Defaults to config value
   * @param restrictIntermediateTokens Whether to restrict intermediate tokens to highly liquid ones. Defaults to config value
   * @param swapMode Whether the amount is for input ('ExactIn') or output ('ExactOut'). Defaults to 'ExactIn'
   * @returns Promise resolving to the quote response from Jupiter API
   * @throws Error if tokens are not found or if no route is available
   */
  async getQuote(
    inputTokenIdentifier: string,
    outputTokenIdentifier: string,
    amount: number,
    slippagePct?: number,
    onlyDirectRoutes: boolean = JupiterConfig.config.onlyDirectRoutes,
    restrictIntermediateTokens: boolean = JupiterConfig.config.restrictIntermediateTokens,
    swapMode: 'ExactIn' | 'ExactOut' = 'ExactIn',
  ): Promise<QuoteResponse> {
    const inputToken = await this.solana.getToken(inputTokenIdentifier);
    const outputToken = await this.solana.getToken(outputTokenIdentifier);

    if (!inputToken || !outputToken) {
      throw new Error(`Token not found: ${!inputToken ? inputTokenIdentifier : outputTokenIdentifier}`);
    }

    const slippageBps = Math.round((slippagePct ?? this.config.slippagePct) * 100);
    const tokenDecimals = swapMode === 'ExactOut' ? outputToken.decimals : inputToken.decimals;
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
    } catch (error) {
      const axiosError = error as any; // Type assertion for axios error
      logger.error('Jupiter API error:', axiosError.message);
      if (axiosError.response?.data) {
        logger.error('Jupiter API error response:', axiosError.response.data);

        // Handle specific error messages
        if (typeof axiosError.response.data === 'string') {
          if (axiosError.response.data === 'Route not found') {
            if (swapMode === 'ExactOut') {
              throw new Error('ExactOut not supported for this token pair');
            } else {
              throw new Error('No route found for this token pair');
            }
          }
          throw new Error(`Jupiter API error: ${axiosError.response.data}`);
        } else if (axiosError.response.data.errorCode === 'COULD_NOT_FIND_ANY_ROUTE') {
          if (swapMode === 'ExactOut') {
            throw new Error('ExactOut not supported for this token pair');
          } else {
            throw new Error('No route found for this token pair');
          }
        } else if (axiosError.response.data.error) {
          throw new Error(`Jupiter API error: ${axiosError.response.data.error}`);
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
    const feeLamports = maxLamports ? Math.floor(maxLamports) : Math.floor(this.config.maxLamports);
    const level = priorityLevel || this.config.priorityLevel;

    logger.info(`Sending swap with priority level ${level} and max ${feeLamports} lamports`);

    // Get swap object from Jupiter API with retry logic
    let lastError: Error | null = null;
    let swapObj: SwapResponse;

    const solanaConfig = getSolanaNetworkConfig(this.solana.network);
    const retryCount = solanaConfig.confirmRetryCount;
    const retryInterval = solanaConfig.confirmRetryInterval;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
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

        const response = await this.httpClient.post('/swap/v1/swap', swapRequest);
        swapObj = response.data;
        break; // Success, exit the retry loop
      } catch (error) {
        const axiosError = error as any; // Type assertion for axios error
        lastError = axiosError;
        logger.error(
          `Fetching swap object attempt ${attempt}/${retryCount} failed:`,
          axiosError.response?.status
            ? {
                error: axiosError.message,
                status: axiosError.response.status,
                data: axiosError.response.data,
              }
            : axiosError,
        );

        if (attempt < retryCount) {
          logger.info(`Waiting ${retryInterval}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }
      }
    }

    if (!swapObj) {
      throw new Error(`Failed to fetch swap route after ${retryCount} attempts. Last error: ${lastError?.message}`);
    }

    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));

    // Sign the transaction (simulation will be done by caller with proper error handling)
    transaction.sign([wallet.payer]);

    return transaction;
  }

  /**
   * Builds a swap transaction for hardware wallets (returns unsigned transaction)
   * @param walletAddress The public key of the hardware wallet
   * @param quote The quote response from Jupiter API
   * @param maxLamports Maximum priority fee in lamports (optional)
   * @param priorityLevel Priority level for transaction (optional)
   * @returns Unsigned transaction ready for hardware wallet signing
   */
  public async buildSwapTransactionForHardwareWallet(
    walletAddress: string,
    quote: QuoteResponse,
    maxLamports?: number,
    priorityLevel?: string,
  ): Promise<VersionedTransaction> {
    // Use provided values or fall back to config
    const feeLamports = maxLamports ? Math.floor(maxLamports) : Math.floor(this.config.maxLamports);
    const level = priorityLevel || this.config.priorityLevel;

    logger.info(
      `Building unsigned swap transaction for hardware wallet ${walletAddress} with priority level ${level} and max ${feeLamports} lamports`,
    );

    // Get swap object from Jupiter API with retry logic
    let lastError: Error | null = null;
    let swapObj: SwapResponse;

    const solanaConfig = getSolanaNetworkConfig(this.solana.network);
    const retryCount = solanaConfig.confirmRetryCount;
    const retryInterval = solanaConfig.confirmRetryInterval;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const swapRequest = {
          quoteResponse: quote,
          userPublicKey: walletAddress, // Use the hardware wallet address directly
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: feeLamports,
              priorityLevel: level,
            },
          },
        };

        const response = await this.httpClient.post('/swap/v1/swap', swapRequest);
        swapObj = response.data;
        break; // Success, exit the retry loop
      } catch (error) {
        const axiosError = error as any;
        lastError = axiosError;
        logger.error(
          `Fetching swap object attempt ${attempt}/${retryCount} failed:`,
          axiosError.response?.status
            ? {
                error: axiosError.message,
                status: axiosError.response.status,
                data: axiosError.response.data,
              }
            : axiosError,
        );

        if (attempt < retryCount) {
          logger.info(`Waiting ${retryInterval}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }
      }
    }

    if (!swapObj) {
      throw new Error(`Failed to fetch swap route after ${retryCount} attempts. Last error: ${lastError?.message}`);
    }

    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));

    // Don't sign the transaction - it will be signed by the hardware wallet
    // Simulation will be done by caller with proper error handling

    return transaction;
  }
}

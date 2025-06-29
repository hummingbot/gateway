import { Wallet } from '@coral-xyz/anchor';
import { VersionedTransaction } from '@solana/web3.js';
import axios, { AxiosInstance } from 'axios';

import { Solana, BASE_FEE } from '../../chains/solana/solana';
import { percentRegexp } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

import { JupiterConfig } from './jupiter.config';

const JUPITER_API_RETRY_COUNT = 5;
const JUPITER_API_RETRY_INTERVAL_MS = 1000;
export const DECIMAL_MULTIPLIER = 10;

// Jupiter API base URL
const JUPITER_API_BASE = 'https://lite-api.jup.ag';

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
  public config: JupiterConfig.NetworkConfig;
  private httpClient: AxiosInstance;

  private constructor() {
    this.config = JupiterConfig.config;
    this.solana = null;

    // Initialize HTTP client with Jupiter API base URL
    const headers: any = {
      'Content-Type': 'application/json',
    };

    // Add API key header if provided
    if (this.config.apiKey && this.config.apiKey.length > 0) {
      headers['x-api-key'] = this.config.apiKey;
      logger.info('Using Jupiter API key for requests');
    } else {
      logger.info('Using Jupiter free tier (no API key)');
    }

    this.httpClient = axios.create({
      baseURL: JUPITER_API_BASE,
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
    const allowedSlippage = this.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) {
      slippage = Number(nd[1]) / Number(nd[2]);
    } else {
      logger.error('Failed to parse slippage value:', allowedSlippage);
    }
    return slippage * 100;
  }

  async getQuote(
    inputTokenIdentifier: string,
    outputTokenIdentifier: string,
    amount: number,
    slippagePct?: number,
    onlyDirectRoutes: boolean = false,
    asLegacyTransaction: boolean = false,
    swapMode: 'ExactIn' | 'ExactOut' = 'ExactIn',
  ): Promise<QuoteResponse> {
    const inputToken = await this.solana.getToken(inputTokenIdentifier);
    const outputToken = await this.solana.getToken(outputTokenIdentifier);

    if (!inputToken || !outputToken) {
      throw new Error(
        `Token not found: ${!inputToken ? inputTokenIdentifier : outputTokenIdentifier}`,
      );
    }

    const slippageBps = slippagePct ? Math.round(slippagePct * 100) : 50; // Default to 0.5% if not provided
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
      asLegacyTransaction: asLegacyTransaction.toString(),
      restrictIntermediateTokens: 'false',
    });

    // Only add maxAccounts for ExactIn mode (not supported for ExactOut)
    if (swapMode === 'ExactIn') {
      params.append('maxAccounts', '64');
    }

    logger.debug(
      `Getting Jupiter quote for ${inputToken.symbol} to ${outputToken.symbol} with params:`,
      params.toString(),
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

  async getSwapObj(
    wallet: Wallet,
    quote: QuoteResponse,
    priorityFee?: number,
  ): Promise<SwapResponse> {
    const feeLamports = priorityFee
      ? Math.floor(priorityFee)
      : Math.floor(this.solana.config.minFee * 1e9);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= JUPITER_API_RETRY_COUNT; attempt++) {
      try {
        const swapRequest = {
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toBase58(),
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: feeLamports,
              priorityLevel: this.getPriorityLevel(this.config.priorityLevel),
            },
          },
        };

        const response = await this.httpClient.post(
          '/swap/v1/swap',
          swapRequest,
        );
        const swapObj = response.data;

        return swapObj;
      } catch (error: any) {
        lastError = error;
        logger.error(
          `[JUPITER] Fetching swap object attempt ${attempt}/${JUPITER_API_RETRY_COUNT} failed:`,
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
            `[JUPITER] Waiting ${JUPITER_API_RETRY_INTERVAL_MS}ms before retry...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, JUPITER_API_RETRY_INTERVAL_MS),
          );
        }
      }
    }

    throw new Error(
      `Failed to fetch swap route after ${JUPITER_API_RETRY_COUNT} attempts. Last error: ${lastError?.message}`,
    );
  }

  public async simulateTransaction(transaction: VersionedTransaction) {
    const { value: simulatedTransactionResponse } =
      await this.solana.connection.simulateTransaction(transaction, {
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
        accounts: { encoding: 'base64', addresses: [] },
        sigVerify: false,
      });

    // console.log('Simulation Result:', {
    //   logs: simulatedTransactionResponse.logs,
    //   unitsConsumed: simulatedTransactionResponse.unitsConsumed,
    //   status: simulatedTransactionResponse.err ? 'FAILED' : 'SUCCESS'
    // });

    if (simulatedTransactionResponse.err) {
      const logs = simulatedTransactionResponse.logs || [];
      // console.log('Simulation Error Details:', {
      //   error: simulatedTransactionResponse.err,
      //   programLogs: logs,
      //   accounts: simulatedTransactionResponse.accounts,
      //   unitsConsumed: simulatedTransactionResponse.unitsConsumed,
      // });

      const errorMessage = `Transaction simulation failed: Error: ${JSON.stringify(simulatedTransactionResponse.err)}\nProgram Logs: ${logs.join('\n')}`;

      throw new Error(errorMessage);
    }
  }

  async executeSwap(
    wallet: Wallet,
    quote: QuoteResponse,
    priorityFeePerCU?: number,
    computeUnits?: number,
  ): Promise<{
    signature: string;
    feeInLamports: number;
    computeUnitLimit: number;
    priorityFeePrice: number;
    confirmed: boolean;
    txData?: any;
  }> {
    // Use provided priority fee per CU or default to minimum
    const finalPriorityFeePerCU = priorityFeePerCU || 0;

    // Use provided compute units or default
    const computeUnitsToUse = computeUnits || 300000;

    // Calculate total priority fee in lamports (priorityFeePerCU is in lamports/CU)
    const currentPriorityFee = Math.floor(
      finalPriorityFeePerCU * computeUnitsToUse,
    );

    logger.info(
      `Sending swap with priority fee of ${finalPriorityFeePerCU} lamports/CU (${(currentPriorityFee / 1e9).toFixed(6)} SOL total)`,
    );

    // Get swap object from Jupiter API
    const swapObj = await this.getSwapObj(wallet, quote, currentPriorityFee);

    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(
      new Uint8Array(swapTransactionBuf),
    );
    await this.simulateTransaction(transaction);
    transaction.sign([wallet.payer]);

    // Send transaction
    const signature = await this.solana.connection.sendRawTransaction(
      Buffer.from(transaction.serialize()),
      { skipPreflight: true },
    );

    // Try to confirm transaction (but don't retry with higher fees)
    let retryCount = 0;
    while (retryCount < this.solana.config.retryCount) {
      try {
        const { confirmed, txData } =
          await this.solana.confirmTransaction(signature);
        if (confirmed && txData) {
          const computeUnitsUsed = txData.meta.computeUnitsConsumed;
          const totalFee = txData.meta.fee;
          const priorityFee = totalFee - BASE_FEE;
          const priorityFeePrice = (priorityFee / computeUnitsUsed) * 1e6;

          return {
            signature,
            feeInLamports: totalFee,
            computeUnitLimit: computeUnitsUsed,
            priorityFeePrice,
            confirmed: true,
            txData,
          };
        }
      } catch (error) {
        logger.debug(
          `[JUPITER] Swap confirmation attempt ${retryCount + 1}/${this.solana.config.retryCount} failed: ${error.message}`,
        );
      }

      retryCount++;
      if (retryCount < this.solana.config.retryCount) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.solana.config.retryInterval * 1000),
        );
      }
    }

    // If we get here, swap wasn't confirmed after retryCount attempts
    // Return pending status for Hummingbot to handle retry
    return {
      signature,
      feeInLamports: 0,
      computeUnitLimit: 0,
      priorityFeePrice: 0,
      confirmed: false,
    };

    // If no signature obtained, throw error
    throw new Error(
      'Failed to execute swap - no transaction signature obtained',
    );
  }

  async extractSwapBalances(
    signature: string,
    inputMint: string,
    outputMint: string,
  ): Promise<{
    totalInputSwapped: number;
    totalOutputSwapped: number;
    fee: number;
  }> {
    let inputBalanceChange: number, outputBalanceChange: number, fee: number;

    // Get transaction info to extract the 'from' address
    const txInfo = await this.solana.connection.getTransaction(signature);
    if (!txInfo) {
      throw new Error('Transaction not found');
    }
    const fromAddress = txInfo.transaction.message.accountKeys[0].toBase58();

    if (inputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: inputBalanceChange, fee } =
        await this.solana.extractAccountBalanceChangeAndFee(signature, 0));
    } else {
      ({ balanceChange: inputBalanceChange, fee } =
        await this.solana.extractTokenBalanceChangeAndFee(
          signature,
          inputMint,
          fromAddress,
        ));
    }

    if (outputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: outputBalanceChange } =
        await this.solana.extractAccountBalanceChangeAndFee(signature, 0));
    } else {
      ({ balanceChange: outputBalanceChange } =
        await this.solana.extractTokenBalanceChangeAndFee(
          signature,
          outputMint,
          fromAddress,
        ));
    }

    return {
      totalInputSwapped: Math.abs(inputBalanceChange),
      totalOutputSwapped: Math.abs(outputBalanceChange),
      fee,
    };
  }

  public static getRequestAmount(amount: number, decimals: number): number {
    return Math.floor(amount * DECIMAL_MULTIPLIER ** decimals);
  }

  /**
   * Converts a priority level string to the expected format for Jupiter API
   * @param priorityLevel The priority level from config
   * @returns Properly formatted priority level for Jupiter API
   */
  private getPriorityLevel(
    priorityLevel: string,
  ): 'medium' | 'high' | 'veryHigh' {
    const level = priorityLevel.toLowerCase();

    if (level === 'medium' || level === 'high') {
      return level as 'medium' | 'high';
    } else if (level === 'veryhigh') {
      return 'veryHigh';
    }

    // Default to medium if invalid value
    logger.warn(
      `Invalid priority level: ${priorityLevel}, defaulting to 'medium'`,
    );
    return 'medium';
  }
}

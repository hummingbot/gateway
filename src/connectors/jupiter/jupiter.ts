import { Solana } from '../../chains/solana/solana';
import { VersionedTransaction } from '@solana/web3.js';
import { 
  QuoteGetRequest, 
  QuoteResponse, 
  SwapResponse, 
  createJupiterApiClient,
} from '@jup-ag/api';
import { JupiterConfig } from './jupiter.config';
import { percentRegexp } from '../../services/config-manager-v2';
import { Wallet } from '@coral-xyz/anchor';
import { logger } from '../../services/logger';
import { BASE_FEE } from '../../chains/solana/solana';
import { 
  HttpException,
  SIMULATION_ERROR_CODE,
  SIMULATION_ERROR_MESSAGE,
  SWAP_ROUTE_FETCH_ERROR_CODE,
  SWAP_ROUTE_FETCH_ERROR_MESSAGE,
} from '../../services/error-handler';

const JUPITER_API_RETRY_COUNT = 5;
const JUPITER_API_RETRY_INTERVAL_MS = 1000;
export const DECIMAL_MULTIPLIER = 10;

export class Jupiter {
  private static _instances: { [name: string]: Jupiter };
  private solana: Solana;
  public config: JupiterConfig.NetworkConfig;
  protected jupiterQuoteApi!: ReturnType<typeof createJupiterApiClient>;

  private constructor() {
    this.config = JupiterConfig.config;
    this.solana = null;
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
      if (!this.jupiterQuoteApi) {
        this.jupiterQuoteApi = createJupiterApiClient();
      }
      logger.info("Initializing Jupiter");
    } catch (error) {
      logger.error("Failed to initialize Jupiter:", error);
      throw error;
    }
  }

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
      throw new Error(`Token not found: ${!inputToken ? inputTokenIdentifier : outputTokenIdentifier}`);
    }

    const slippageBps = slippagePct ? Math.round(slippagePct * 100) : 0;
    const tokenDecimals = swapMode === 'ExactOut' ? outputToken.decimals : inputToken.decimals;
    const quoteAmount = Math.floor(amount * 10 ** tokenDecimals);

    const params: QuoteGetRequest = {
      inputMint: inputToken.address,
      outputMint: outputToken.address,
      amount: quoteAmount,
      slippageBps,
      onlyDirectRoutes,
      asLegacyTransaction,
      swapMode,
    };

    const quote = await this.jupiterQuoteApi.quoteGet(params);

    if (!quote) {
      logger.error('Unable to get quote');
      throw new Error('Unable to get quote');
    }

    return quote;
  }

  async getSwapObj(wallet: Wallet, quote: QuoteResponse, priorityFee?: number): Promise<SwapResponse> {
    const prioritizationFeeLamports = priorityFee 
      ? Math.floor(priorityFee)
      : Math.floor(this.solana.config.minPriorityFee * 1e9);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= JUPITER_API_RETRY_COUNT; attempt++) {
      try {
        const swapObj = await this.jupiterQuoteApi.swapPost({
          swapRequest: {
            quoteResponse: quote,
            userPublicKey: wallet.publicKey.toBase58(),
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports,
          },
        });
        return swapObj;
      } catch (error) {
        lastError = error;
        logger.error(`[JUPITER] Fetching swap object attempt ${attempt}/${JUPITER_API_RETRY_COUNT} failed:`, 
          error.response?.status ? {
            error: error.message,
            status: error.response.status,
            data: error.response.data
          } : error
        );

        if (attempt < JUPITER_API_RETRY_COUNT) {
          logger.info(`[JUPITER] Waiting ${JUPITER_API_RETRY_INTERVAL_MS}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, JUPITER_API_RETRY_INTERVAL_MS));
        }
      }
    }

    throw new HttpException(
      503,
      SWAP_ROUTE_FETCH_ERROR_MESSAGE + `Failed after ${JUPITER_API_RETRY_COUNT} attempts. Last error: ${lastError?.message}`,
      SWAP_ROUTE_FETCH_ERROR_CODE
    );
  }

  public async simulateTransaction(transaction: VersionedTransaction) {
    const { value: simulatedTransactionResponse } = await this.solana.connection.simulateTransaction(
      transaction,
      {
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
        accounts: { encoding: 'base64', addresses: [] },
        sigVerify: false,
      },
    );
    
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

      const errorMessage = `${SIMULATION_ERROR_MESSAGE}\nError: ${JSON.stringify(simulatedTransactionResponse.err)}\nProgram Logs: ${logs.join('\n')}`;
      
      throw new HttpException(
        503,
        errorMessage,
        SIMULATION_ERROR_CODE
      );
    }
  }

  async executeSwap(
    wallet: Wallet,
    quote: QuoteResponse,
  ): Promise<{ 
    signature: string; 
    feeInLamports: number;
    computeUnitLimit: number;
    priorityFeePrice: number;
  }> {
    let currentPriorityFee = (await this.solana.getGasPrice() * 1e9) - BASE_FEE;

    logger.info(`Sending swap with max priority fee of ${(currentPriorityFee / 1e9).toFixed(6)} SOL`);

    // Convert maxPriorityFee from SOL to lamports for comparison
    while (currentPriorityFee <= this.solana.config.maxPriorityFee * 1e9) {
      const swapObj = await this.getSwapObj(wallet, quote, currentPriorityFee);

      const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));
      await this.simulateTransaction(transaction);
      transaction.sign([wallet.payer]);

      let retryCount = 0;
      while (retryCount < this.solana.config.retryCount) {
        try {
          const signature = await this.solana.connection.sendRawTransaction(
            Buffer.from(transaction.serialize()),
            { skipPreflight: true }
          );

          try {
            const { confirmed, txData } = await this.solana.confirmTransaction(signature);
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
              };
            }
          } catch (error) {
            logger.debug(`[JUPITER] Swap confirmation attempt ${retryCount + 1}/${this.solana.config.retryCount} failed with priority fee ${(currentPriorityFee / 1e9).toFixed(6)} SOL: ${error.message}`);
          }

          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.solana.config.retryIntervalMs));
        } catch (error) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.solana.config.retryIntervalMs));
        }
      }

      // If we get here, swap wasn't confirmed after retryCount attempts
      // Increase the priority fee and try again
      currentPriorityFee = currentPriorityFee * this.solana.config.priorityFeeMultiplier;
      logger.info(`[JUPITER] Increasing max priority fee to ${(currentPriorityFee / 1e9).toFixed(6)} SOL`);
    }

    throw new Error(`[JUPITER] Swap failed after reaching max priority fee of ${(this.solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`);
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
        ({ balanceChange: inputBalanceChange, fee } = await this.solana.extractAccountBalanceChangeAndFee(
            signature,
            0,
        ));
    } else {
        ({ balanceChange: inputBalanceChange, fee } = await this.solana.extractTokenBalanceChangeAndFee(
            signature,
            inputMint,
            fromAddress,
        ));
    }

    if (outputMint === 'So11111111111111111111111111111111111111112') {
        ({ balanceChange: outputBalanceChange } = await this.solana.extractAccountBalanceChangeAndFee(
            signature,
            0,
        ));
    } else {
        ({ balanceChange: outputBalanceChange } = await this.solana.extractTokenBalanceChangeAndFee(
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

}
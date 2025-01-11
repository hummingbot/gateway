import { Solana } from '../../chains/solana/solana';
import { VersionedTransaction, Transaction } from '@solana/web3.js';
import { 
  QuoteGetRequest, 
  QuoteResponse, 
  SwapResponse, 
  createJupiterApiClient,
} from '@jup-ag/api';
import { JupiterConfig } from './jupiter.config';
import { percentRegexp } from '../../services/config-manager-v2';
import { Wallet } from '@coral-xyz/anchor';
import { 
  PRIORITY_FEE_MULTIPLIER, 
  MAX_PRIORITY_FEE, 
  RETRY_COUNT, 
  RETRY_INTERVAL_MS,
  BASE_FEE,
  MIN_PRIORITY_FEE 
} from '../../chains/solana/solana';
import { logger } from '../../services/logger';


export class Jupiter {
  private static _instances: { [name: string]: Jupiter };
  private chain: Solana;
  private _ready: boolean = false;
  private _config: JupiterConfig.NetworkConfig;
  protected jupiterQuoteApi!: ReturnType<typeof createJupiterApiClient>;
  public gasCost: number;
  public priorityFeeMultiplier: number;

  private constructor(network: string) {
    this._config = JupiterConfig.config;
    this.chain = Solana.getInstance(network);
    this.gasCost = JupiterConfig.config.gasCost ?? 0;;
    this.priorityFeeMultiplier = JupiterConfig.config.priorityFeeMultiplier ?? 1;
    this.loadJupiter();
  }

  protected async loadJupiter(): Promise<void> {
    try {
      if (!this.jupiterQuoteApi) {
        this.jupiterQuoteApi = createJupiterApiClient();
        
      }
    } catch (error) {
      logger.error("Failed to initialize Jupiter:", error);
      throw error;
    }
  }

  public static getInstance(network: string): Jupiter {
    if (Jupiter._instances === undefined) {
      Jupiter._instances = {};
    }
    if (!(network in Jupiter._instances)) {
      Jupiter._instances[network] = new Jupiter(network);
    }

    return Jupiter._instances[network];
  }

  public async init() {
    if (!this.chain.ready()) {
      await this.chain.init();
    }
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  getSlippagePct(): number {
    const allowedSlippage = this._config.allowedSlippage;
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
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    slippagePct?: number,
    onlyDirectRoutes: boolean = false,
    asLegacyTransaction: boolean = false,
    swapMode: 'ExactIn' | 'ExactOut' = 'ExactIn',
  ): Promise<QuoteResponse> {
    await this.loadJupiter();

    const inputToken = this.chain.getTokenForSymbol(inputTokenSymbol);
    const outputToken = this.chain.getTokenForSymbol(outputTokenSymbol);

    if (!inputToken || !outputToken) {
      logger.error('Invalid token symbols');
      throw new Error('Invalid token symbols');
    }

    const slippageBps = slippagePct ? Math.round(slippagePct * 100) : 50;
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
      ? priorityFee  // Use provided priority fee in lamports
      : MIN_PRIORITY_FEE;  // Use MIN_PRIORITY_FEE constant from solana.ts

      logger.info(`Sending swap with priority fee: ${priorityFee / 1e9} SOL`);

    const swapObj = await this.jupiterQuoteApi.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports,
      },
    });
    return swapObj;
  }

  async simulateTransaction(transaction: VersionedTransaction) {
    const { value: simulatedTransactionResponse } = await this.chain.connectionPool.getNextConnection().simulateTransaction(
      transaction,
      {
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
      },
    );
    
    if (simulatedTransactionResponse.err) {
      logger.error('Simulation Error:', simulatedTransactionResponse);
      throw new Error('Transaction simulation failed');
    }
  }

  async executeSwap(
    wallet: Wallet,
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    slippagePct?: number,
  ): Promise<string> {
    await this.loadJupiter();
    let currentPriorityFee = (await this.chain.getGasPrice() * 1e9) - BASE_FEE;

    while (currentPriorityFee <= MAX_PRIORITY_FEE) {
      const quote = await this.getQuote(
        inputTokenSymbol,
        outputTokenSymbol,
        amount,
        slippagePct,
      );

      const swapObj = await this.getSwapObj(wallet, quote, currentPriorityFee);
      const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));
      transaction.sign([wallet.payer]);

      let retryCount = 0;
      while (retryCount < RETRY_COUNT) {
        try {
          const signature = await this.chain.sendRawTransaction(
            Buffer.from(transaction.serialize()),
            swapObj.lastValidBlockHeight,
          );

          // Wait for confirmation
          for (const connection of this.chain.connectionPool.getAllConnections()) {
            try {
              const confirmed = await this.chain.confirmTransaction(signature, connection);
              if (confirmed) {
                return signature;
              }
            } catch (error) {
              logger.error(`Swap confirmation attempt failed: ${error.message}`);
            }
          }

          retryCount++;
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
        } catch (error) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
        }
      }

      // If we get here, swap wasn't confirmed after RETRY_COUNT attempts
      // Increase the priority fee and try again
      currentPriorityFee = Math.floor(currentPriorityFee * PRIORITY_FEE_MULTIPLIER);
      logger.info(`Increasing priority fee to ${currentPriorityFee / 1e9} SOL`);
    }

    throw new Error(`Swap failed after reaching maximum priority fee of ${MAX_PRIORITY_FEE / 1e9 } SOL`);
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
    const txInfo = await this.chain.connectionPool.getNextConnection().getTransaction(signature);
    if (!txInfo) {
        throw new Error('Transaction not found');
    }
    const fromAddress = txInfo.transaction.message.accountKeys[0].toBase58();

    if (inputMint === 'So11111111111111111111111111111111111111112') {
        ({ balanceChange: inputBalanceChange, fee } = await this.chain.extractAccountBalanceChangeAndFee(
            signature,
            0,
        ));
    } else {
        ({ balanceChange: inputBalanceChange, fee } = await this.chain.extractTokenBalanceChangeAndFee(
            signature,
            inputMint,
            fromAddress,
        ));
    }

    if (outputMint === 'So11111111111111111111111111111111111111112') {
        ({ balanceChange: outputBalanceChange } = await this.chain.extractAccountBalanceChangeAndFee(
            signature,
            0,
        ));
    } else {
        ({ balanceChange: outputBalanceChange } = await this.chain.extractTokenBalanceChangeAndFee(
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

}
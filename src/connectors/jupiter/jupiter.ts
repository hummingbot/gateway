import { Solana } from '../../chains/solana/solana';
import { VersionedTransaction } from '@solana/web3.js';
import { 
  QuoteGetRequest, 
  QuoteResponse, 
  SwapResponse, 
  createJupiterApiClient 
} from '@jup-ag/api';
import { JupiterConfig } from './jupiter.config';
import { percentRegexp } from '../../services/config-manager-v2';
import { Wallet } from '@coral-xyz/anchor';
import { priorityFeeMultiplier } from '../../chains/solana/solana.controllers';


export class Jupiter {
  private static _instances: { [name: string]: Jupiter };
  private chain: Solana;
  private _ready: boolean = false;
  private _config: JupiterConfig.NetworkConfig;
  protected jupiterQuoteApi!: ReturnType<typeof createJupiterApiClient>;
  public gasCost: number = 0;

  private constructor(network: string) {
    this._config = JupiterConfig.config;
    this.chain = Solana.getInstance(network);
    this.gasCost = JupiterConfig.config.gasCost;
    this.loadJupiter();
  }

  protected async loadJupiter(): Promise<void> {
    try {
      if (!this.jupiterQuoteApi) {
        this.jupiterQuoteApi = createJupiterApiClient();
        
      }
    } catch (error) {
      console.error("Failed to initialize Jupiter:", error);
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
        console.error('Failed to parse slippage value:', allowedSlippage);
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
      console.error('Invalid token symbols');
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
      console.error('Unable to get quote');
      throw new Error('Unable to get quote');
    }

    return quote;
  }

  async getSwapObj(wallet: Wallet, quote: QuoteResponse): Promise<SwapResponse> {
    const swapObj = await this.jupiterQuoteApi.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          autoMultiplier: Math.min(priorityFeeMultiplier, 3),
        },
      },
    });
    return swapObj;
  }

  async executeSwap(
    wallet: Wallet,
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    slippagePct?: number,
  ): Promise<{
    signature: string;
    totalInputSwapped: number;
    totalOutputSwapped: number;
    fee: number;
  }> {
    await this.loadJupiter();

    const quote = await this.getQuote(
      inputTokenSymbol,
      outputTokenSymbol,
      amount,
      slippagePct,
    );

    console.log('Wallet:', wallet.publicKey.toBase58());

    const swapObj = await this.getSwapObj(wallet, quote);

    const swapTransactionBuf = Buffer.from(swapObj.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(new Uint8Array(swapTransactionBuf));

    transaction.sign([wallet.payer]);

    const { value: simulatedTransactionResponse } = await this.chain.connectionPool.getNextConnection().simulateTransaction(
      transaction,
      {
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
      },
    );
    const { err, logs } = simulatedTransactionResponse;

    if (err) {
      console.error('Simulation Error:');
      console.error({ err, logs });
      throw new Error('Transaction simulation failed');
    }

    const serializedTransaction = Buffer.from(transaction.serialize());
    const signature = await this.chain.sendAndConfirmRawTransaction(
      serializedTransaction,
      wallet.payer.publicKey.toBase58(),
      swapObj.lastValidBlockHeight,
    );

    let inputBalanceChange: number, outputBalanceChange: number, fee: number;

    if (quote.inputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: inputBalanceChange, fee } = await this.chain.extractAccountBalanceChangeAndFee(
        signature,
        0,
      ));
    } else {
      ({ balanceChange: inputBalanceChange, fee } = await this.chain.extractTokenBalanceChangeAndFee(
        signature,
        quote.inputMint,
        wallet.publicKey.toBase58(),
      ));
    }

    if (quote.outputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: outputBalanceChange } = await this.chain.extractAccountBalanceChangeAndFee(
        signature,
        0,
      ));
    } else {
      ({ balanceChange: outputBalanceChange } = await this.chain.extractTokenBalanceChangeAndFee(
        signature,
        quote.outputMint,
        wallet.publicKey.toBase58(),
      ));
    }

    const totalInputSwapped = Math.abs(inputBalanceChange);
    const totalOutputSwapped = Math.abs(outputBalanceChange);

    return { signature, totalInputSwapped, totalOutputSwapped, fee };
  }

}
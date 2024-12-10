import { Solana } from '../../chains/solana/solana';
import { 
  QuoteGetRequest, 
  QuoteResponse, 
  SwapResponse, 
  createJupiterApiClient 
} from '@jup-ag/api';
import { JupiterConfig } from './jupiter.config';
import { percentRegexp } from '../../services/config-manager-v2';
// import { PriceRequest } from '../../amm/amm.requests';
import { Wallet } from '@coral-xyz/anchor';
import { priorityFeeMultiplier } from '../../chains/solana/solana.controllers';


// import axios from 'axios';
// import {
//   JupiterQuoteResponse,
//   SwapTransactionBuilderResponse,
// } from './jupiter.requests';
// import { latency } from '../../services/base';
// import Decimal from 'decimal.js-light';
// import { getPairData } from './jupiter.controllers';
// import { pow } from 'mathjs';
// import { Keypair, VersionedTransaction } from '@solana/web3.js';

export class Jupiter {
  private static _instances: { [name: string]: Jupiter };
  private chain: Solana;
  private _ready: boolean = false;
  private _config: JupiterConfig.NetworkConfig;
  protected jupiterQuoteApi: ReturnType<typeof createJupiterApiClient>;

  private constructor(network: string) {
    this._config = JupiterConfig.config;
    this.chain = Solana.getInstance(network);
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

  public static getInstance(chain: string, network: string): Jupiter {
    if (Jupiter._instances === undefined) {
      Jupiter._instances = {};
    }
    if (!(chain + network in Jupiter._instances)) {
      Jupiter._instances[chain + network] = new Jupiter(network);
    }

    return Jupiter._instances[chain + network];
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

  getSlippage(): number {
    const allowedSlippage = this._config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) slippage = Number(nd[1]) / Number(nd[2]);
    return slippage;
  }

  async getQuote(
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    slippagePct?: number,
    onlyDirectRoutes: boolean = false,
    asLegacyTransaction: boolean = false,
  ): Promise<QuoteResponse> {
    await this.loadJupiter();

    const inputToken = this.chain.getTokenForSymbol(inputTokenSymbol);
    const outputToken = this.chain.getTokenForSymbol(outputTokenSymbol);

    if (!inputToken || !outputToken) {
      console.error('Invalid token symbols');
      throw new Error('Invalid token symbols');
    }

    const slippageBps = slippagePct ? Math.round(slippagePct * 100) : 50;
    const quoteAmount = Math.floor(amount * 10 ** inputToken.decimals);

    const params: QuoteGetRequest = {
      inputMint: inputToken.address,
      outputMint: outputToken.address,
      amount: quoteAmount,
      slippageBps,
      onlyDirectRoutes,
      asLegacyTransaction,
      swapMode: 'ExactIn',
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
          autoMultiplier: Math.max(priorityFeeMultiplier, 3),
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
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    transaction.sign([wallet.payer]);

    const { value: simulatedTransactionResponse } = await this.connectionPool.getNextConnection().simulateTransaction(
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
    const signature = await this.sendAndConfirmRawTransaction(
      serializedTransaction,
      wallet.payer.publicKey.toBase58(),
      swapObj.lastValidBlockHeight,
    );

    let inputBalanceChange: number, outputBalanceChange: number, fee: number;

    if (quote.inputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: inputBalanceChange, fee } = await this.extractAccountBalanceChangeAndFee(
        signature,
        0,
      ));
    } else {
      ({ balanceChange: inputBalanceChange, fee } = await this.extractTokenBalanceChangeAndFee(
        signature,
        quote.inputMint,
        this.keypair.publicKey.toBase58(),
      ));
    }

    if (quote.outputMint === 'So11111111111111111111111111111111111111112') {
      ({ balanceChange: outputBalanceChange } = await this.extractAccountBalanceChangeAndFee(
        signature,
        0,
      ));
    } else {
      ({ balanceChange: outputBalanceChange } = await this.extractTokenBalanceChangeAndFee(
        signature,
        quote.outputMint,
        this.keypair.publicKey.toBase58(),
      ));
    }

    const totalInputSwapped = Math.abs(inputBalanceChange);
    const totalOutputSwapped = Math.abs(outputBalanceChange);

    return { signature, totalInputSwapped, totalOutputSwapped, fee };
  }

  // async price(req: PriceRequest) {
  //   const startTimestamp: number = Date.now();
  //   const baseToken = this.chain.getTokenForSymbol(req.base);
  //   const quoteToken = this.chain.getTokenForSymbol(req.quote);
  //   if (!baseToken || !quoteToken) {
  //     throw new Error('INVALID TOKEN');
  //   }

  //   const amount = Number(req.amount) * <number>pow(10, baseToken.decimals);
  //   const baseURL = `https://quote-api.jup.ag/v6/quote?inputMint=${baseToken?.address}&outputMint=${quoteToken?.address}&amount=${amount}`;
  //   const price = await getPairData(baseToken?.address, quoteToken?.address);

  //   const basePriceInUSD = price.data[baseToken?.address].price;
  //   const quotePriceInUSD = price.data[quoteToken?.address].price;

  //   const tokenPrice =
  //     req.side === 'BUY'
  //       ? Number(quotePriceInUSD) / Number(basePriceInUSD)
  //       : Number(basePriceInUSD) / Number(quotePriceInUSD);
  //   const response = await axios.get<JupiterQuoteResponse>(baseURL);

  //   return {
  //     timestamp: startTimestamp,
  //     latency: latency(startTimestamp, Date.now()),
  //     base: response.data.inputMint,
  //     quote: response.data.outputMint,
  //     amount: new Decimal(req.amount).toFixed(6),
  //     rawAmount: response.data.inAmount,
  //     expectedAmount: response.data.outAmount,
  //     price: tokenPrice.toString(),
  //     gasPrice: 0.0001,
  //     gasLimit: 100000,
  //     expectedPrice: tokenPrice,
  //     trade: response.data,
  //   };
  // }
  // async trade(quoteResponse: JupiterQuoteResponse, wallet: Keypair) {
  //   const url = 'https://quote-api.jup.ag/v6/swap';
  //   const response = await axios.post<SwapTransactionBuilderResponse>(url, {
  //     quoteResponse,
  //     userPublicKey: wallet.publicKey.toString(),
  //     wrapAndUnwrapSol: true,
  //     prioritizationFeeLamports: {
  //       autoMultiplier: 2,
  //     },
  //   });
  //   const swapTransactionBuf = Buffer.from(
  //     response.data.swapTransaction,
  //     'base64',
  //   );
  //   const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  //   transaction.sign([wallet]);
  //   const latestBlockHash = await this.chain.connection.getLatestBlockhash();
  //   const rawTransaction = transaction.serialize();
  //   const txid = await this.chain.connection.sendRawTransaction(
  //     rawTransaction,
  //     {
  //       skipPreflight: true,
  //       maxRetries: 2,
  //     },
  //   );
  //   await this.chain.connection.confirmTransaction({
  //     blockhash: latestBlockHash.blockhash,
  //     lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
  //     signature: txid,
  //   });
  //   return { txid, ...response.data };
  // }

}
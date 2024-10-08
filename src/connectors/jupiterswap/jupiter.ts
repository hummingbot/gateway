import LRUCache from 'lru-cache';
import { Solana } from '../../chains/solana/solana';
import { JupiterswapConfig } from './jupiterswap.config';
import { getAlgorandConfig } from '../../chains/algorand/algorand.config';
import { percentRegexp } from '../../services/config-manager-v2';
import { PriceRequest } from '../../amm/amm.requests';
import axios from 'axios';
import { JupiterQuoteResponse } from './jupiter.request';
import { latency } from '../../services/base';
import Decimal from 'decimal.js-light';
import { getPairData } from './jupiter.controller';

export class Jupiter {
  private static _instances: LRUCache<string, Jupiter>;
  private chain: Solana;
  private _ready: boolean = false;
  private _config: JupiterswapConfig.NetworkConfig;
  // private _swap
  private constructor(network: string) {
    this._config = JupiterswapConfig.config;
    this.chain = Solana.getInstance(network);
    // this._swap = Swap
  }

  public static getInstance(network: string): Jupiter {
    const config = getAlgorandConfig(network);
    if (Jupiter._instances === undefined) {
      Jupiter._instances = new LRUCache<string, Jupiter>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Jupiter._instances.has(network)) {
      if (network !== null) {
        Jupiter._instances.set(network, new Jupiter(network));
      } else {
        throw new Error(
          `Tinyman.getInstance received an unexpected network: ${network}.`,
        );
      }
    }

    return Jupiter._instances.get(network) as Jupiter;
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

  // async fetchData(baseToken: SolanaAsset, quoteToken: SolanaAsset) {
  //   return await
  // }
  // async estimateTrade(req: PriceRequest) {}
  async price(req: PriceRequest) {
    const startTimestamp: number = Date.now();
    const baseToken = this.chain.getAssetForSymbol(req.base);
    const quoteToken = this.chain.getAssetForSymbol(req.quote);
    if (!baseToken || !quoteToken) {
      throw new Error('INVALID TOKEN');
    }
    const baseURL = `https://quote-api.jup.ag/v6/quote?inputMint=${baseToken?.address}&outputMint=${quoteToken?.address}&amount=${req.amount}`;
    const price = await getPairData(baseToken?.address, quoteToken?.address);

    const basePriceInUSD = price.data[baseToken?.address].price;
    const quotePriceInUSD = price.data[quoteToken?.address].price;

    const tokenPrice =
      req.side === 'BUY'
        ? Number(quotePriceInUSD) / Number(basePriceInUSD)
        : Number(basePriceInUSD) / Number(quotePriceInUSD);
    const response = await axios.get<JupiterQuoteResponse>(baseURL);

    return {
      timestamp: startTimestamp,
      latency: latency(startTimestamp, Date.now()),
      base: response.data.inputMint,
      quote: response.data.outputMint,
      amount: new Decimal(req.amount).toFixed(6),
      rawAmount: response.data.inAmount,
      expectedAmount: response.data.outAmount,
      price: tokenPrice.toString(),
      gasPrice: 0.0001,
      gasLimit: 100000,
    };
  }
  async trade() {}
}

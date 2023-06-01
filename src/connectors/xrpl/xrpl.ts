import { XRPL } from '../../chains/xrpl/xrpl';
import {
  Client,
  OfferCancel,
  Transaction,
  xrpToDrops,
  AccountInfoResponse,
  BookOffersResponse,
} from 'xrpl';
import {
  Market,
  MarketNotFoundError,
  Token,
  OrderStatus,
  TradeType,
  Orderbook,
  PriceLevel,
  Order,
} from './xrpl.types';
import {
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobTickerRequest,
  ClobGetOrderRequest,
  ClobPostOrderRequest,
  ClobDeleteOrderRequest,
  CLOBMarkets,
  ClobGetOrderResponse,
} from '../../clob/clob.requests';
import { promiseAllInBatches } from '../../chains/xrpl/xrpl.helpers';
import { isIssuedCurrency } from 'xrpl/dist/npm/models/transactions/common';
import {
  CLOBish,
  NetworkSelectionRequest,
} from '../../services/common-interfaces';
import LRUCache from 'lru-cache';
import { getXRPLConfig } from '../../chains/xrpl/xrpl.config';
import { isUndefined } from 'mathjs';
import { OrderType } from './xrpl.types';

const XRP_FACTOR = 1000000;
const ORDERBOOK_LIMIT = 10;

export class XRPLCLOB implements CLOBish {
  private static _instances: LRUCache<string, XRPLCLOB>;
  private readonly _client: Client;
  private readonly _xrpl: XRPL;

  private _ready: boolean = false;

  public parsedMarkets: CLOBMarkets = {};
  public chain: string;
  public network: string;

  private constructor(chain: string, network: string) {
    this.chain = chain;
    this.network = network;

    this._xrpl = XRPL.getInstance(network);
    this._client = this._xrpl.client;
  }

  public static getInstance(chain: string, network: string): XRPLCLOB {
    if (XRPLCLOB._instances === undefined) {
      const config = getXRPLConfig(chain, network);
      XRPLCLOB._instances = new LRUCache<string, XRPLCLOB>({
        max: config.network.maxLRUCacheInstances,
      });
    }
    const instanceKey = chain + network;
    if (!XRPLCLOB._instances.has(instanceKey)) {
      XRPLCLOB._instances.set(instanceKey, new XRPLCLOB(chain, network));
    }

    return XRPLCLOB._instances.get(instanceKey) as XRPLCLOB;
  }

  public async loadMarkets() {
    const rawMarkets = await this.fetchMarkets();
    for (const market of rawMarkets) {
      this.parsedMarkets[market.marketId.replace('/', '-')] = market;
    }
  }

  public async init() {
    if (!this._xrpl.ready() || Object.keys(this.parsedMarkets).length === 0) {
      await this._xrpl.init();
      await this.loadMarkets();
      this._ready = true;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  // CLOB methods:
  // TODO: Find and correct the required market info in client
  public async markets(
    req: ClobMarketsRequest
  ): Promise<{ markets: CLOBMarkets }> {
    if (req.market && req.market.split('-').length === 2) {
      const resp: CLOBMarkets = {};
      resp[req.market] = this.parsedMarkets[req.market];
      return { markets: resp };
    }
    return { markets: this.parsedMarkets };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    return await this.getOrderBook(this.parsedMarkets[req.market].marketId);
  }

  // Utility methods:
  async fetchMarkets(): Promise<Market[]> {
    const loadedMarkets: Market[] = [];
    // TODO: Move marketsToLoad to config file
    const marketsToLoad = [
      'ETH.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h/USD.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h',
      'XRP/ETH.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h',
      'ETH.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h/XRP',
    ];

    const getMarket = async (marketId: string): Promise<void> => {
      const market = await this.getMarket(marketId);

      loadedMarkets.concat(market);
    };

    await promiseAllInBatches(getMarket, marketsToLoad, 1, 1);

    return loadedMarkets;
  }

  async getMarket(marketId?: string): Promise<Market> {
    if (!marketId) throw new MarketNotFoundError(`No market informed.`);
    // Market marketId format:
    // 1: "ETH.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h/USD.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h"
    // 2: "XRP/ETH.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h"
    // 3: "ETH.rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h/XRP"
    let baseTickSize: number;
    let baseTransferRate: number;
    let quoteTickSize: number;
    let quoteTransferRate: number;
    const zeroTransferRate = 1000000000;

    const [base, quote] = marketId.split('/');

    const [baseCurrency, baseIssuer] = base.split('.');
    const [quoteCurrency, quoteIssuer] = quote.split('.');

    if (baseCurrency != 'XRP') {
      const baseMarketResp: AccountInfoResponse = await this._client.request({
        command: 'account_info',
        ledger_index: 'validated',
        account: baseIssuer,
      });

      if (!baseMarketResp)
        throw new MarketNotFoundError(`Market "${base}" not found.`);

      baseTickSize = baseMarketResp.result.account_data.TickSize ?? 15;
      const rawTransferRate =
        baseMarketResp.result.account_data.TransferRate ?? zeroTransferRate;
      baseTransferRate = rawTransferRate / zeroTransferRate - 1;
    } else {
      baseTickSize = 6;
      baseTransferRate = 0;
    }

    if (quoteCurrency != 'XRP') {
      const quoteMarketResp: AccountInfoResponse = await this._client.request({
        command: 'account_info',
        ledger_index: 'validated',
        account: quoteIssuer,
      });

      if (!quoteMarketResp)
        throw new MarketNotFoundError(`Market "${quote}" not found.`);

      quoteTickSize = quoteMarketResp.result.account_data.TickSize ?? 15;
      const rawTransferRate =
        quoteMarketResp.result.account_data.TransferRate ?? zeroTransferRate;
      quoteTransferRate = rawTransferRate / zeroTransferRate - 1;
    } else {
      quoteTickSize = 6;
      quoteTransferRate = 0;
    }

    const smallestTickSize = Math.min(baseTickSize, quoteTickSize);
    const minimumOrderSize = smallestTickSize;

    // TODO: conform to this type:
    // export interface ClobMarketResponse {
    //   network: string;
    //   timestamp: number;
    //   latency: number;
    //   markets: CLOBMarkets;
    // }

    const result = {
      marketId: marketId,
      minimumOrderSize: minimumOrderSize,
      tickSize: smallestTickSize,
      baseTransferRate: baseTransferRate,
      quoteTransferRate: quoteTransferRate,
    };

    return result;
  }

  async getOrderBook(marketId: string): Promise<Orderbook> {
    const [base, quote] = marketId.split('/');

    const [baseCurrency, baseIssuer] = base.split('.');
    const [quoteCurrency, quoteIssuer] = quote.split('.');

    const baseRequest: any = {
      currency: baseCurrency,
    };

    const quoteRequest: any = {
      currency: quoteCurrency,
    };

    if (baseIssuer) {
      baseRequest['issuer'] = baseIssuer;
    }
    if (quoteIssuer) {
      quoteRequest['issuer'] = quoteIssuer;
    }

    const orderbook_resp_ask: BookOffersResponse = await this._client.request({
      command: 'book_offers',
      ledger_index: 'validated',
      taker_gets: baseRequest,
      taker_pays: quoteRequest,
      limit: ORDERBOOK_LIMIT,
    });

    const orderbook_resp_bid: BookOffersResponse = await this._client.request({
      command: 'book_offers',
      ledger_index: 'validated',
      taker_gets: quoteRequest,
      taker_pays: baseRequest,
      limit: ORDERBOOK_LIMIT,
    });

    const asks = orderbook_resp_ask.result.offers;
    const bids = orderbook_resp_bid.result.offers;

    const buys: PriceLevel[] = [];
    const sells: PriceLevel[] = [];

    bids.forEach((bid) => {
      if (isUndefined(bid.quality)) return;

      let price, quantity: string;

      if (typeof bid.taker_gets_funded === 'string') {
        price = (Math.pow(parseFloat(bid.quality), -1) / XRP_FACTOR).toString();
        quantity = (parseFloat(bid.taker_gets_funded) * XRP_FACTOR).toString();
      } else if (typeof bid.taker_pays_funded === 'string') {
        if (isUndefined(bid.taker_gets_funded)) return;
        if (isUndefined(bid.taker_gets_funded?.value)) return;

        price = (Math.pow(parseFloat(bid.quality), -1) * XRP_FACTOR).toString();
        quantity = bid.taker_gets_funded.value;
      } else {
        if (isUndefined(bid.taker_gets_funded)) return;
        if (isUndefined(bid.taker_gets_funded?.value)) return;

        price = Math.pow(parseFloat(bid.quality), -1).toString();
        quantity = bid.taker_gets_funded.value;
      }

      buys.concat({
        price,
        quantity,
        timestamp: Date.now(),
      });
    });

    asks.forEach((ask) => {
      if (isUndefined(ask.quality)) return;

      let price, quantity: string;

      if (typeof ask.taker_gets_funded === 'string') {
        price = (parseFloat(ask.quality) * XRP_FACTOR).toString();
        quantity = (parseFloat(ask.taker_gets_funded) * XRP_FACTOR).toString();
      } else if (typeof ask.taker_pays_funded === 'string') {
        if (isUndefined(ask.taker_gets_funded)) return;
        if (isUndefined(ask.taker_gets_funded?.value)) return;

        price = (parseFloat(ask.quality) / XRP_FACTOR).toString();
        quantity = ask.taker_gets_funded.value;
      } else {
        if (isUndefined(ask.taker_gets_funded)) return;
        if (isUndefined(ask.taker_gets_funded?.value)) return;

        price = ask.quality;
        quantity = ask.taker_gets_funded.value;
      }

      sells.concat({
        price,
        quantity,
        timestamp: Date.now(),
      });
    });

    return {
      buys,
      sells,
    };
  }

  public async ticker(
    req: ClobTickerRequest
  ): Promise<{ markets: CLOBMarkets }> {
    return await this.markets(req);
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    if (!req.market) return { orders: [] };
    const marketId: string = this.parsedMarkets[req.market].marketId;

    const [base, quote] = marketId.split('/');

    const [baseCurrency, baseIssuer] = base.split('.');
    const [quoteCurrency, quoteIssuer] = quote.split('.');

    const orders: Order[] = [];

    const baseRequest: any = {
      currency: baseCurrency,
    };

    const quoteRequest: any = {
      currency: quoteCurrency,
    };

    if (baseIssuer) {
      baseRequest['issuer'] = baseIssuer;
    }
    if (quoteIssuer) {
      quoteRequest['issuer'] = quoteIssuer;
    }

    const orderbook_resp_ask: BookOffersResponse = await this._client.request({
      command: 'book_offers',
      ledger_index: 'validated',
      taker: req.address,
      taker_gets: baseRequest,
      taker_pays: quoteRequest,
    });

    const orderbook_resp_bid: BookOffersResponse = await this._client.request({
      command: 'book_offers',
      ledger_index: 'validated',
      taker: req.address,
      taker_gets: quoteRequest,
      taker_pays: baseRequest,
    });

    let asks = orderbook_resp_ask.result.offers;
    let bids = orderbook_resp_bid.result.offers;

    asks = asks.filter((ask) => ask.Account == req.address);
    bids = bids.filter((bid) => bid.Account == req.address);

    for (const ask of asks) {
      const price = ask.quality ?? '-1';
      let amount: string = '';

      if (isIssuedCurrency(ask.TakerGets)) {
        amount = ask.TakerGets.value;
      } else {
        amount = ask.TakerGets;
      }

      orders.push({
        hash: ask.Sequence,
        marketId: marketId,
        price: price,
        amount: amount,
        state: OrderStatus.OPEN, // TODO: create middle class to track this property
        tradeType: TradeType.SELL,
        orderType: OrderType.LIMIT,
        createdAt: Date.now(), // TODO: create middle class to track this property
        updatedAt: Date.now(), // TODO: create middle class to track this property
      });
    }

    for (const bid of bids) {
      const price = Math.pow(Number(bid.quality), -1).toString() ?? '-1';
      let amount: string = '';

      if (isIssuedCurrency(bid.TakerGets)) {
        amount = bid.TakerGets.value;
      } else {
        amount = bid.TakerGets;
      }

      orders.push({
        hash: bid.Sequence,
        marketId: marketId,
        price: price,
        amount: amount,
        state: OrderStatus.OPEN, // TODO: create middle class to track this property
        tradeType: TradeType.BUY,
        orderType: OrderType.LIMIT,
        createdAt: Date.now(), // TODO: create middle class to track this property
        updatedAt: Date.now(), // TODO: create middle class to track this property
      });
    }

    return { orders } as ClobGetOrderResponse;
  }

  public async postOrder(
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string }> {
    const marketId: string = this.parsedMarkets[req.market].marketId;

    const [base, quote] = marketId.split('/');
    const [baseCurrency, baseIssuer] = base.split('.');
    const [quoteCurrency, quoteIssuer] = quote.split('.');

    const market = await this.getMarket(marketId);

    const xrpl = this._xrpl;
    const wallet = await xrpl.getWallet(req.address);
    const total = parseFloat(req.price) * parseFloat(req.amount);

    let we_pay: Token = {
      currency: '',
      issuer: '',
      value: '',
    };
    let we_get: Token = { currency: '', issuer: '', value: '' };

    if (req.side == TradeType.SELL) {
      we_pay = {
        currency: quoteCurrency,
        issuer: quoteIssuer,
        value: Number(total.toPrecision(market.tickSize)).toString(),
      };
      we_get = {
        currency: baseCurrency,
        issuer: baseIssuer,
        value: Number(
          parseFloat(req.amount).toPrecision(market.tickSize)
        ).toString(),
      };
    } else {
      we_pay = {
        currency: baseCurrency,
        issuer: baseIssuer,
        value: Number(
          parseFloat(req.amount).toPrecision(market.tickSize)
        ).toString(),
      };
      we_get = {
        currency: quoteCurrency,
        issuer: quoteIssuer,
        value: Number(total.toPrecision(market.tickSize)).toString(),
      };
    }

    if (we_pay.currency == 'XRP') {
      we_pay.value = xrpToDrops(we_pay.value);
    }

    if (we_get.currency == 'XRP') {
      we_get.value = xrpToDrops(we_get.value);
    }

    const offer: Transaction = {
      TransactionType: 'OfferCreate',
      Account: wallet.classicAddress,
      TakerGets: we_pay.currency == 'XRP' ? we_pay.value : we_pay,
      TakerPays: we_get.currency == 'XRP' ? we_get.value : we_get,
    };

    const prepared = await this._client.autofill(offer);
    const signed = wallet.sign(prepared);
    const response = await this._client.submit(signed.tx_blob);

    const txHash = response.result.tx_json.hash
      ? response.result.tx_json.hash
      : '';

    return { txHash };
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string }> {
    const xrpl = this._xrpl;
    const wallet = await xrpl.getWallet(req.address);
    const request: OfferCancel = {
      TransactionType: 'OfferCancel',
      Account: wallet.classicAddress,
      OfferSequence: parseInt(req.orderId),
    };

    const prepared = await this._client.autofill(request);
    const signed = wallet.sign(prepared);
    const response = await this._client.submit(signed.tx_blob);

    const txHash = response.result.tx_json.hash
      ? response.result.tx_json.hash
      : '';

    return { txHash };
  }

  public estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    const fee_estimate = this._xrpl.fee;

    return {
      gasPrice: parseFloat(fee_estimate.median),
      gasPriceToken: this._xrpl.nativeTokenSymbol,
      gasLimit: parseFloat(this._client.maxFeeXRP),
      gasCost: parseFloat(fee_estimate.median) * this._client.feeCushion,
    };
  }
}

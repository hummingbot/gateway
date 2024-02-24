import { MarketInfo, XRPL } from '../../chains/xrpl/xrpl';
import { XRPLOrderStorage } from '../../chains/xrpl/xrpl.order-storage';
import {
  Client,
  Wallet,
  Transaction,
  xrpToDrops,
  AccountInfoResponse,
  BookOffersResponse,
} from 'xrpl';
import { OrderTracker } from '../../chains/xrpl/xrpl.order-tracker';
import {
  Market,
  MarketNotFoundError,
  Token,
  TradeType,
  Orderbook,
  PriceLevel,
  Order,
} from './xrpl.types';
import {
  getTakerGetsAmount,
  getTakerPaysAmount,
  getTakerGetsFundedAmount,
  getTakerPaysFundedAmount,
  convertHexToString,
} from './xrpl.utils';
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
import {
  CLOBish,
  NetworkSelectionRequest,
} from '../../services/common-interfaces';
import LRUCache from 'lru-cache';
import { getXRPLConfig } from '../../chains/xrpl/xrpl.config';
import { isUndefined } from 'mathjs';
import { convertStringToHex } from './xrpl.utils';
import { logger } from '../../services/logger';

// const XRP_FACTOR = 1000000;
const ORDERBOOK_LIMIT = 50;
const TXN_SUBMIT_DELAY = 100;
export class XRPLCLOB implements CLOBish {
  private static _instances: LRUCache<string, XRPLCLOB>;
  private readonly _client: Client;
  private readonly _xrpl: XRPL;
  private readonly _orderStorage: XRPLOrderStorage;

  private _ready: boolean = false;
  private _isSubmittingTxn: boolean = false;

  public parsedMarkets: CLOBMarkets = {};
  public chain: string;
  public network: string;

  private constructor(chain: string, network: string) {
    this.chain = chain;
    this.network = network;

    this._xrpl = XRPL.getInstance(network);
    this._client = this._xrpl.client;
    this._orderStorage = this._xrpl.orderStorage;
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

  public async loadMarkets(marketId: string = '') {
    while (!this._xrpl.ready()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (marketId.length > 0) {
      const market = await this.fetchMarkets(marketId);
      this.parsedMarkets[market[0].marketId] = market[0];
    } else {
      const rawMarkets = await this.fetchMarkets();
      for (const market of rawMarkets) {
        this.parsedMarkets[market.marketId] = market;
      }
    }
  }

  public async init() {
    await this._xrpl.init();
    // await this.loadMarkets();
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  public getInfo(): string {
    const info = `XRPLCLOB: ${this.chain} ${this.network} | RCP URL: ${this._xrpl.rpcUrl} | XRPLCLOB ready: ${this._ready}`;

    return info;
  }

  // CLOB methods:
  // TODO: Find and correct the required market info in client
  public async markets(
    req: ClobMarketsRequest
  ): Promise<{ markets: Array<Market> }> {
    if (req.market && req.market.split('-').length === 2) {
      if (!this.parsedMarkets[req.market]) {
        // const fetchedMarket = await this.fetchMarkets(req.market);
        await this.loadMarkets(req.market);
      }

      const marketsAsArray: Array<Market> = [];
      marketsAsArray.push(this.parsedMarkets[req.market]);
      return { markets: marketsAsArray };
    }

    // Load all markets
    await this.loadMarkets();

    const marketsAsArray: Array<Market> = [];
    for (const marketId in this.parsedMarkets) {
      marketsAsArray.push(this.parsedMarkets[marketId]);
    }

    return { markets: marketsAsArray };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    if (!this.parsedMarkets[req.market]) {
      await this.loadMarkets(req.market);
    }

    return await this.getOrderBook(this.parsedMarkets[req.market]);
  }

  // Utility methods:
  async fetchMarkets(marketId: String = ''): Promise<Market[]> {
    const loadedMarkets: Market[] = [];

    // If marketId is provided, fetch only that market
    if (marketId.length > 0) {
      logger.info(
        `Fetching 1 market ${marketId} for ${this.chain} ${this.network}`
      );
      const market = this._xrpl.storedMarketList.find(
        (m) => m.marketId === marketId
      );
      if (!market)
        throw new MarketNotFoundError(`Market "${marketId}" not found.`);
      const processedMarket = await this.getMarket(market);
      loadedMarkets.push(processedMarket);
      return loadedMarkets;
    }

    // Fetch all markets
    const markets = this._xrpl.storedMarketList;
    const getMarket = async (market: MarketInfo): Promise<void> => {
      const processedMarket = await this.getMarket(market);
      loadedMarkets.push(processedMarket);
    };

    logger.info(`Fetching markets for ${this.chain} ${this.network}`);

    await promiseAllInBatches(getMarket, markets, 6, 100);

    return loadedMarkets;
  }

  async getMarket(market: MarketInfo): Promise<Market> {
    if (!market) throw new MarketNotFoundError(`No market informed.`);
    let baseTickSize,
      baseTransferRate,
      quoteTickSize,
      quoteTransferRate: number;
    const zeroTransferRate = 1000000000;

    const baseCurrency = convertStringToHex(market.baseCode);
    const quoteCurrency = convertStringToHex(market.quoteCode);
    const baseIssuer = market.baseIssuer;
    const quoteIssuer = market.quoteIssuer;

    if (baseCurrency != 'XRP') {
      await this._xrpl.ensureConnection();
      const baseMarketResp: AccountInfoResponse = await this._client.request({
        command: 'account_info',
        ledger_index: 'validated',
        account: baseIssuer,
      });

      if (!baseMarketResp)
        throw new MarketNotFoundError(
          `Market "${baseCurrency}.${baseIssuer}" not found.`
        );

      baseTickSize = baseMarketResp.result.account_data.TickSize ?? 15;
      const rawTransferRate =
        baseMarketResp.result.account_data.TransferRate ?? zeroTransferRate;
      baseTransferRate = rawTransferRate / zeroTransferRate - 1;
    } else {
      baseTickSize = 6;
      baseTransferRate = 0;
    }

    if (quoteCurrency != 'XRP') {
      await this._xrpl.ensureConnection();
      const quoteMarketResp: AccountInfoResponse = await this._client.request({
        command: 'account_info',
        ledger_index: 'validated',
        account: quoteIssuer,
      });

      if (!quoteMarketResp)
        throw new MarketNotFoundError(
          `Market "${quoteCurrency}.${quoteIssuer}" not found.`
        );

      quoteTickSize = quoteMarketResp.result.account_data.TickSize ?? 15;
      const rawTransferRate =
        quoteMarketResp.result.account_data.TransferRate ?? zeroTransferRate;
      quoteTransferRate = rawTransferRate / zeroTransferRate - 1;
    } else {
      quoteTickSize = 6;
      quoteTransferRate = 0;
    }

    const smallestTickSize = Math.min(baseTickSize, quoteTickSize);
    const minimumOrderSize = Math.pow(10, -smallestTickSize);

    const result = {
      marketId: market.marketId,
      minimumOrderSize: minimumOrderSize,
      smallestTickSize: smallestTickSize,
      baseTickSize,
      quoteTickSize,
      baseTransferRate: baseTransferRate,
      quoteTransferRate: quoteTransferRate,
      baseIssuer: baseIssuer,
      quoteIssuer: quoteIssuer,
      baseCurrency: baseCurrency,
      quoteCurrency: quoteCurrency,
    };

    return result;
  }

  async getOrderBook(
    market: Market,
    limit: number = ORDERBOOK_LIMIT
  ): Promise<Orderbook> {
    const baseRequest: any = {
      currency: market.baseCurrency,
      issuer: market.baseIssuer,
    };

    const quoteRequest: any = {
      currency: market.quoteCurrency,
      issuer: market.quoteIssuer,
    };

    if (market.baseCurrency == 'XRP') {
      // remove issuer
      delete baseRequest['issuer'];
    }

    if (market.quoteCurrency == 'XRP') {
      // remove issuer
      delete quoteRequest['issuer'];
    }

    const { bids, asks } = await this.getOrderBookFromXRPL(
      baseRequest,
      quoteRequest,
      limit
    );

    const buys: PriceLevel[] = [];
    const sells: PriceLevel[] = [];

    bids.forEach((bid) => {
      let price, quantity: string;

      if (
        isUndefined(bid.taker_gets_funded) &&
        isUndefined(bid.taker_pays_funded)
      ) {
        if (isUndefined(bid.TakerGets)) return;
        if (isUndefined(bid.TakerPays)) return;

        price = (
          parseFloat(getTakerGetsAmount(bid)) /
          parseFloat(getTakerPaysAmount(bid))
        ).toString();
        quantity = getTakerPaysAmount(bid);
      } else {
        if (isUndefined(bid.taker_gets_funded)) return;
        if (isUndefined(bid.taker_pays_funded)) return;

        price = (
          parseFloat(getTakerGetsFundedAmount(bid)) /
          parseFloat(getTakerPaysFundedAmount(bid))
        ).toString();
        quantity = getTakerPaysFundedAmount(bid);
      }

      buys.push({
        price,
        quantity,
        timestamp: Date.now(),
      });
    });

    asks.forEach((ask) => {
      let price, quantity: string;

      if (
        isUndefined(ask.taker_gets_funded) &&
        isUndefined(ask.taker_pays_funded)
      ) {
        if (isUndefined(ask.TakerGets)) return;
        if (isUndefined(ask.TakerPays)) return;

        price = (
          parseFloat(getTakerPaysAmount(ask)) /
          parseFloat(getTakerGetsAmount(ask))
        ).toString();
        quantity = getTakerGetsAmount(ask);
      } else {
        if (isUndefined(ask.taker_gets_funded)) return;
        if (isUndefined(ask.taker_pays_funded)) return;

        price = (
          parseFloat(getTakerPaysFundedAmount(ask)) /
          parseFloat(getTakerGetsFundedAmount(ask))
        ).toString();
        quantity = getTakerGetsFundedAmount(ask);
      }

      sells.push({
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
  ): Promise<{ markets: Array<Market> }> {
    const getMarkets = await this.markets(req);
    const markets = getMarkets.markets;

    const marketsWithMidprice = await Promise.all(
      markets.map(async (market) => {
        const midprice = await this.getMidPriceForMarket(
          this.parsedMarkets[market.marketId]
        );
        return { ...market, midprice };
      })
    );

    return { markets: marketsWithMidprice };
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    if (!req.address) return { orders: [] };
    if (!req.orderId) return { orders: [] };

    if (req.orderId === 'all') {
      if (!req.market) return { orders: [] };
      const marketId = this.parsedMarkets[req.market].marketId;
      const orders = await this._orderStorage.getOrdersByMarket(
        this.chain,
        this.network,
        req.address,
        marketId
      );

      const keys = Object.keys(orders);
      const ordersArray = keys.map((key) => orders[key]);

      return { orders: ordersArray } as ClobGetOrderResponse;
    } else {
      const orders = await this._orderStorage.getOrdersByHash(
        this.chain,
        this.network,
        req.address,
        req.orderId
      );

      const keys = Object.keys(orders);
      const ordersArray = keys.map((key) => orders[key]);

      return { orders: ordersArray } as ClobGetOrderResponse;
    }
  }

  public async postOrder(
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string }> {
    const market = this.parsedMarkets[req.market] as Market;
    const baseCurrency = market.baseCurrency;
    const quoteCurrency = market.quoteCurrency;
    const baseIssuer = market.baseIssuer;
    const quoteIssuer = market.quoteIssuer;
    let price = parseFloat(req.price);

    // If it is market order
    // Increase price by 3% if it is buy order
    // Decrease price by 3% if it is sell order
    if (req.orderType == 'MARKET') {
      const midPrice = await this.getMidPriceForMarket(market);
      if (req.side == TradeType.BUY) {
        price = midPrice * 1.03;
      } else {
        price = midPrice * 0.97;
      }
    }

    const wallet = await this.getWallet(req.address);
    const total = price * parseFloat(req.amount);

    let we_pay: Token = {
      currency: '',
      issuer: '',
      value: '',
    };
    let we_get: Token = { currency: '', issuer: '', value: '' };

    if (req.side == TradeType.SELL) {
      we_pay = {
        currency: baseCurrency,
        issuer: baseIssuer,
        value: Number(
          parseFloat(req.amount).toPrecision(market.smallestTickSize)
        ).toString(),
      };
      we_get = {
        currency: quoteCurrency,
        issuer: quoteIssuer,
        value: Number(total.toPrecision(market.smallestTickSize)).toString(),
      };
    } else {
      we_pay = {
        currency: quoteCurrency,
        issuer: quoteIssuer,
        value: Number(total.toPrecision(market.smallestTickSize)).toString(),
      };
      we_get = {
        currency: baseCurrency,
        issuer: baseIssuer,
        value: Number(
          parseFloat(req.amount).toPrecision(market.smallestTickSize)
        ).toString(),
      };
    }

    if (we_pay.currency == 'XRP') {
      we_pay.value = xrpToDrops(we_pay.value);
    }

    if (we_get.currency == 'XRP') {
      we_get.value = xrpToDrops(we_get.value);
    }

    let flag = 0;

    switch (req.orderType) {
      case 'LIMIT':
        flag = 0;
        break;
      case 'LIMIT_MAKER':
        flag = 65536;
        break;
      case 'MARKET':
        flag = 131072;
        break;
      default:
        throw new Error('Order type not supported');
    }

    const offer: Transaction = {
      TransactionType: 'OfferCreate',
      Flags: flag,
      Account: wallet.classicAddress,
      TakerGets: we_pay.currency == 'XRP' ? we_pay.value : we_pay,
      TakerPays: we_get.currency == 'XRP' ? we_get.value : we_get,
    };

    const { prepared, signed } = await this.submitTxn(offer, wallet);

    const currentTime = Date.now();
    const currentLedgerIndex = await this.getCurrentBlockNumber();

    const order: Order = {
      hash: prepared.Sequence ? prepared.Sequence : 0,
      marketId:
        convertHexToString(baseCurrency) +
        '-' +
        convertHexToString(quoteCurrency),
      price: req.price,
      amount: req.amount,
      filledAmount: '0',
      state: 'PENDING_OPEN',
      tradeType: req.side,
      orderType: req.orderType,
      createdAt: currentTime,
      createdAtLedgerIndex: currentLedgerIndex,
      updatedAt: currentTime,
      updatedAtLedgerIndex: currentLedgerIndex,
      associatedTxns: [signed.hash],
      associatedFills: [],
    };

    await this.trackOrder(wallet, order);

    return { txHash: signed.hash };
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string }> {
    await this._xrpl.ensureConnection();
    const wallet = await this.getWallet(req.address);
    const offer: Transaction = {
      TransactionType: 'OfferCancel',
      Account: wallet.classicAddress,
      OfferSequence: parseInt(req.orderId),
    };

    const { signed } = await this.submitTxn(offer, wallet);

    let order = this.getOrder(wallet, req);

    if (order) {
      order.state = 'PENDING_CANCEL';
      order.updatedAt = Date.now();
      order.updatedAtLedgerIndex = await this.getCurrentBlockNumber();
      order.associatedTxns.push(signed.hash);
    } else {
      order = {
        hash: parseInt(req.orderId),
        marketId: '',
        price: '',
        amount: '',
        filledAmount: '',
        state: 'PENDING_CANCEL',
        tradeType: TradeType.UNKNOWN,
        orderType: 'LIMIT',
        createdAt: Date.now(),
        createdAtLedgerIndex: await this.getCurrentBlockNumber(),
        updatedAt: Date.now(),
        updatedAtLedgerIndex: await this.getCurrentBlockNumber(),
        associatedTxns: [signed.hash],
        associatedFills: [],
      };
    }

    await this.trackOrder(wallet, order);

    return { txHash: signed.hash };
  }

  public estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    return this.getFeeEstimate();
  }

  private async submitTxn(offer: Transaction, wallet: Wallet) {
    while (this._isSubmittingTxn) {
      await new Promise((resolve) => setTimeout(resolve, TXN_SUBMIT_DELAY));
    }

    this._isSubmittingTxn = true;
    const prepared = await this._client.autofill(offer);
    const signed = wallet.sign(prepared);
    await this._xrpl.ensureConnection();
    await this._client.submit(signed.tx_blob);
    this._isSubmittingTxn = false;
    return { prepared, signed };
  }

  private async getWallet(address: string) {
    const wallet = await this._xrpl.getWallet(address);
    return wallet;
  }

  private async getOrderBookFromXRPL(
    baseRequest: any,
    quoteRequest: any,
    limit: number
  ) {
    await this._xrpl.ensureConnection();
    const orderbook_resp_ask: BookOffersResponse = await this._client.request({
      command: 'book_offers',
      ledger_index: 'validated',
      taker_gets: baseRequest,
      taker_pays: quoteRequest,
      limit,
    });

    await this._xrpl.ensureConnection();
    const orderbook_resp_bid: BookOffersResponse = await this._client.request({
      command: 'book_offers',
      ledger_index: 'validated',
      taker_gets: quoteRequest,
      taker_pays: baseRequest,
      limit,
    });

    const asks = orderbook_resp_ask.result.offers;
    const bids = orderbook_resp_bid.result.offers;
    return { bids, asks };
  }

  private async getCurrentBlockNumber() {
    await this._xrpl.ensureConnection();
    return await this._client.getLedgerIndex();
  }

  private getFeeEstimate() {
    const fee_estimate = this._xrpl.fee;

    return {
      gasPrice: parseFloat(fee_estimate.median),
      gasPriceToken: this._xrpl.nativeTokenSymbol,
      gasLimit: parseFloat(this._client.maxFeeXRP),
      gasCost: parseFloat(fee_estimate.median) * this._client.feeCushion,
    };
  }

  private getOrder(wallet: Wallet, req: ClobDeleteOrderRequest) {
    const orderTracker = OrderTracker.getInstance(
      this.chain,
      this.network,
      wallet
    );

    return orderTracker.getOrder(parseInt(req.orderId));
  }

  private async trackOrder(wallet: Wallet, order: Order) {
    const orderTracker = OrderTracker.getInstance(
      this.chain,
      this.network,
      wallet
    );

    await orderTracker.addOrder(order);
  }

  private async getMidPriceForMarket(market: Market) {
    const orderbook = await this.getOrderBook(market, 1);
    try {
      const bestAsk = orderbook.sells[0];
      const bestBid = orderbook.buys[0];
      const midPrice =
        (parseFloat(bestAsk.price) + parseFloat(bestBid.price)) / 2;
      return midPrice;
    } catch (error) {
      // TODO: report this error

      return 0;
    }
  }
}

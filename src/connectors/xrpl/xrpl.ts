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
import { OrderTracker } from './xrpl.order-tracker';
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

const XRP_FACTOR = 1000000;
const ORDERBOOK_LIMIT = 10;

export class XRPLCLOB implements CLOBish {
  private static _instances: LRUCache<string, XRPLCLOB>;
  private readonly _client: Client;
  private readonly _xrpl: XRPL;
  private readonly _orderStorage: XRPLOrderStorage;

  private _ready: boolean = false;

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

  public async loadMarkets() {
    const rawMarkets = await this.fetchMarkets();
    for (const market of rawMarkets) {
      this.parsedMarkets[market.marketId] = market;
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
    if (req.market && req.market in this.parsedMarkets)
      return { markets: this.parsedMarkets[req.market] };
    return { markets: Object.values(this.parsedMarkets) };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    return await this.getOrderBook(this.parsedMarkets[req.market]);
  }

  // Utility methods:
  async fetchMarkets(): Promise<Market[]> {
    const loadedMarkets: Market[] = [];
    const markets = this._xrpl.storedMarketList;

    const getMarket = async (market: MarketInfo): Promise<void> => {
      const processedMarket = await this.getMarket(market);

      loadedMarkets.push(processedMarket);
    };

    await promiseAllInBatches(getMarket, markets, 1, 1);

    return loadedMarkets;
  }

  async getMarket(market: MarketInfo): Promise<Market> {
    if (!market) throw new MarketNotFoundError(`No market informed.`);
    let baseTickSize,
      baseTransferRate,
      quoteTickSize,
      quoteTransferRate: number;
    const zeroTransferRate = 1000000000;

    const [baseCurrency, quoteCurrency] = market.marketId.split('-');
    const baseIssuer = market.baseIssuer;
    const quoteIssuer = market.quoteIssuer;

    if (baseCurrency != 'XRP') {
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
    const minimumOrderSize = smallestTickSize;

    const result = {
      marketId: market.marketId,
      minimumOrderSize: minimumOrderSize,
      tickSize: smallestTickSize,
      baseTransferRate: baseTransferRate,
      quoteTransferRate: quoteTransferRate,
      baseIssuer: baseIssuer,
      quoteIssuer: quoteIssuer,
      baseCurrency: baseCurrency,
      quoteCurrency: quoteCurrency,
    };

    return result;
  }

  async getOrderBook(market: MarketInfo): Promise<Orderbook> {
    const [baseCurrency, quoteCurrency] = market.marketId.split('-');
    const baseIssuer = market.baseIssuer;
    const quoteIssuer = market.quoteIssuer;

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

    const { bids, asks } = await this.getOrderBookFromXRPL(
      baseRequest,
      quoteRequest
    );

    const buys: PriceLevel[] = [];
    const sells: PriceLevel[] = [];

    bids.forEach((bid) => {
      if (isUndefined(bid.quality)) return;

      let price, quantity: string;

      if (
        isUndefined(bid.taker_gets_funded) &&
        isUndefined(bid.taker_pays_funded)
      ) {
        if (typeof bid.TakerGets === 'string') {
          price = (
            Math.pow(parseFloat(bid.quality), -1) / XRP_FACTOR
          ).toString();
          quantity = (parseFloat(bid.TakerGets) * XRP_FACTOR).toString();
        } else if (typeof bid.TakerPays === 'string') {
          if (isUndefined(bid.TakerGets)) return;
          if (isUndefined(bid.TakerGets?.value)) return;

          price = (
            Math.pow(parseFloat(bid.quality), -1) * XRP_FACTOR
          ).toString();
          quantity = bid.TakerGets.value;
        } else {
          if (isUndefined(bid.TakerGets)) return;
          if (isUndefined(bid.TakerGets?.value)) return;

          price = Math.pow(parseFloat(bid.quality), -1).toString();
          quantity = bid.TakerGets.value;
        }
      } else {
        if (typeof bid.taker_gets_funded === 'string') {
          price = (
            Math.pow(parseFloat(bid.quality), -1) / XRP_FACTOR
          ).toString();
          quantity = (
            parseFloat(bid.taker_gets_funded) * XRP_FACTOR
          ).toString();
        } else if (typeof bid.taker_pays_funded === 'string') {
          if (isUndefined(bid.taker_gets_funded)) return;
          if (isUndefined(bid.taker_gets_funded?.value)) return;

          price = (
            Math.pow(parseFloat(bid.quality), -1) * XRP_FACTOR
          ).toString();
          quantity = bid.taker_gets_funded.value;
        } else {
          if (isUndefined(bid.taker_gets_funded)) return;
          if (isUndefined(bid.taker_gets_funded?.value)) return;

          price = Math.pow(parseFloat(bid.quality), -1).toString();
          quantity = bid.taker_gets_funded.value;
        }
      }

      buys.push({
        price,
        quantity,
        timestamp: Date.now(),
      });
    });

    asks.forEach((ask) => {
      if (isUndefined(ask.quality)) return;

      let price, quantity: string;

      if (
        isUndefined(ask.taker_gets_funded) &&
        isUndefined(ask.taker_pays_funded)
      ) {
        if (typeof ask.TakerGets === 'string') {
          price = (parseFloat(ask.quality) * XRP_FACTOR).toString();
          quantity = (parseFloat(ask.TakerGets) / XRP_FACTOR).toString();
        } else if (typeof ask.TakerPays === 'string') {
          if (isUndefined(ask.TakerGets)) return;
          if (isUndefined(ask.TakerGets?.value)) return;

          price = (parseFloat(ask.quality) / XRP_FACTOR).toString();
          quantity = ask.TakerGets.value;
        } else {
          if (isUndefined(ask.TakerPays)) return;
          if (isUndefined(ask.TakerPays?.value)) return;

          price = ask.quality;
          quantity = ask.TakerGets.value;
        }
      } else {
        if (typeof ask.taker_gets_funded === 'string') {
          price = (parseFloat(ask.quality) * XRP_FACTOR).toString();
          quantity = (
            parseFloat(ask.taker_gets_funded) / XRP_FACTOR
          ).toString();
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
  ): Promise<{ markets: CLOBMarkets }> {
    return await this.markets(req);
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    if (!req.market) return { orders: [] };
    if (!req.address) return { orders: [] };

    if (!req.orderId) {
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
      const marketId = this.parsedMarkets[req.market].marketId;
      const orders = await this._orderStorage.getOrderByMarketAndHash(
        this.chain,
        this.network,
        req.address,
        marketId,
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
    const [baseCurrency, quoteCurrency] = market.marketId.split('-');
    const baseIssuer = market.baseIssuer;
    const quoteIssuer = market.quoteIssuer;

    const wallet = await this.getWallet(req.address);
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

    const { prepared, signed } = await this.submitTxn(offer, wallet);

    const currentTime = Date.now();
    const currentLedgerIndex = await this.getCurrentBlockNumber();

    const order: Order = {
      hash: prepared.Sequence ? prepared.Sequence : 0,
      marketId: baseCurrency + '-' + quoteCurrency,
      price: req.price,
      amount: req.amount,
      filledAmount: '0',
      state: 'PENDING_OPEN',
      tradeType: req.side,
      orderType: 'LIMIT',
      createdAt: currentTime,
      createdAtLedgerIndex: currentLedgerIndex,
      updatedAt: currentTime,
      updatedAtLedgerIndex: currentLedgerIndex,
      associatedTxns: [signed.hash],
    };

    const orderTracker = OrderTracker.getInstance(
      this.chain,
      this.network,
      wallet
    );

    orderTracker.addOrder(order);

    if (orderTracker.isTracking) {
      orderTracker.startTracking();
    }

    return { txHash: signed.hash };
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string }> {
    const wallet = await this.getWallet(req.address);
    const offer: Transaction = {
      TransactionType: 'OfferCancel',
      Account: wallet.classicAddress,
      OfferSequence: parseInt(req.orderId),
    };

    const { signed } = await this.submitTxn(offer, wallet);

    const orderTracker = OrderTracker.getInstance(
      this.chain,
      this.network,
      wallet
    );

    let order = orderTracker.getOrder(parseInt(req.orderId));

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
      };
    }

    orderTracker.addOrder(order);

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
    const prepared = await this._client.autofill(offer);
    const signed = wallet.sign(prepared);
    await this._client.submit(signed.tx_blob);
    return { prepared, signed };
  }

  private async getWallet(address: string) {
    const wallet = await this._xrpl.getWallet(address);
    return wallet;
  }

  private async getOrderBookFromXRPL(baseRequest: any, quoteRequest: any) {
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
    return { bids, asks };
  }

  private async getCurrentBlockNumber() {
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
}

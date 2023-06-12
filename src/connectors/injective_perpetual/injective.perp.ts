import {
  DerivativeOrderHistory,
  derivativePriceToChainPriceToFixed,
  derivativeQuantityToChainQuantityToFixed,
  DerivativeTrade,
  FundingPayment,
  GrpcOrderType,
  IndexerGrpcDerivativesApi,
  IndexerGrpcOracleApi,
  MsgBatchUpdateOrders,
  Orderbook,
  PerpetualMarket,
  Position,
  TradeDirection,
} from '@injectivelabs/sdk-ts';
import { BigNumber, utils } from 'ethers';
import LRUCache from 'lru-cache';
import { OrderSide } from '@injectivelabs/ts-types';
import { Injective } from '../../chains/injective/injective';
import { getInjectiveConfig } from '../../chains/injective/injective.config';
import {
  FundingInfo,
  PerpClobDeleteOrderRequest,
  PerpClobFundingInfoRequest,
  PerpClobFundingPaymentsRequest,
  PerpClobGetOrderRequest,
  PerpClobGetTradesRequest,
  PerpClobMarketRequest,
  PerpClobMarkets,
  PerpClobOrderbookRequest,
  PerpClobPositionRequest,
  PerpClobPostOrderRequest,
  PerpClobTickerRequest,
  PerpClobGetLastTradePriceRequest,
  PerpClobBatchUpdateRequest,
  ClobDeleteOrderRequestExtract,
  CreatePerpOrderParam,
} from '../../clob/clob.requests';
import { NetworkSelectionRequest } from '../../services/common-interfaces';
import { InjectiveCLOBConfig } from '../injective/injective.clob.config';

function enumFromStringValue<T>(
  enm: { [s: string]: T },
  value: string
): T | undefined {
  return (Object.values(enm) as unknown as string[]).includes(value)
    ? (value as unknown as T)
    : undefined;
}

export class InjectiveClobPerp {
  private static _instances: LRUCache<string, InjectiveClobPerp>;
  private _chain;
  public conf;
  public derivativeApi: IndexerGrpcDerivativesApi;
  public oracleApi: IndexerGrpcOracleApi;
  private _ready: boolean = false;
  public parsedMarkets: PerpClobMarkets = {};

  private constructor(_chain: string, network: string) {
    this._chain = Injective.getInstance(network);
    this.conf = InjectiveCLOBConfig.config;
    this.derivativeApi = new IndexerGrpcDerivativesApi(
      this._chain.endpoints.indexer
    );
    this.oracleApi = new IndexerGrpcOracleApi(this._chain.endpoints.indexer);
  }

  public static getInstance(chain: string, network: string): InjectiveClobPerp {
    if (InjectiveClobPerp._instances === undefined) {
      const config = getInjectiveConfig(network);
      InjectiveClobPerp._instances = new LRUCache<string, InjectiveClobPerp>({
        max: config.network.maxLRUCacheInstances,
      });
    }
    const instanceKey = chain + network;
    if (!InjectiveClobPerp._instances.has(instanceKey)) {
      InjectiveClobPerp._instances.set(
        instanceKey,
        new InjectiveClobPerp(chain, network)
      );
    }

    return InjectiveClobPerp._instances.get(instanceKey) as InjectiveClobPerp;
  }

  public async loadMarkets() {
    const derivativeMarkets = await this.derivativeApi.fetchMarkets();
    for (const market of derivativeMarkets) {
      const key = market.ticker.replace('/', '-').replace(' PERP', '');
      this.parsedMarkets[key] = <PerpetualMarket>market;
    }
  }

  public async init() {
    if (!this._chain.ready() || Object.keys(this.parsedMarkets).length === 0) {
      await this._chain.init();
      await this.loadMarkets();
      this._ready = true;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  public async markets(
    req: PerpClobMarketRequest
  ): Promise<{ markets: PerpClobMarkets }> {
    if (req.market && req.market.split('-').length === 2) {
      const resp: PerpClobMarkets = {};

      resp[req.market] = this.parsedMarkets[req.market];
      return { markets: resp };
    }
    return { markets: this.parsedMarkets };
  }

  public async orderBook(req: PerpClobOrderbookRequest): Promise<Orderbook> {
    return await this.derivativeApi.fetchOrderbookV2(
      this.parsedMarkets[req.market].marketId
    );
  }

  public async ticker(
    req: PerpClobTickerRequest
  ): Promise<{ markets: PerpClobMarkets }> {
    return await this.markets(req);
  }

  public async lastTradePrice(
    req: PerpClobGetLastTradePriceRequest
  ): Promise<string | null> {
    const marketInfo = this.parsedMarkets[req.market];
    const marketId = marketInfo.marketId;
    const oracleScaleFactor = parseFloat(`1e-${marketInfo.oracleScaleFactor}`);
    const pagination = {
      skip: 0,
      limit: 1,
      key: '',
    };
    const result = await this.derivativeApi.fetchTrades({
      marketId,
      pagination,
    });

    let price = null;
    if (result.trades.length > 0) {
      price = (
        parseFloat(result.trades[0].executionPrice) * oracleScaleFactor
      ).toString();
    }

    return price;
  }

  public async trades(
    req: PerpClobGetTradesRequest
  ): Promise<Array<DerivativeTrade>> {
    const marketId = this.parsedMarkets[req.market].marketId;

    const firstPage = await this.derivativeApi.fetchTrades({
      marketId,
      subaccountId: req.address,
    });

    let targetTrade = undefined;

    let skip = 0;
    const pagination = {
      skip,
      limit: 100,
      key: '',
    };

    const trades = firstPage.trades;
    if (req.orderId !== undefined) {
      for (const trade of trades) {
        if (trade.orderHash === req.orderId) {
          targetTrade = trade;
          break;
        }
      }
    }

    const total = firstPage.pagination.total;
    if (total > 100) {
      skip = skip + 99;
      while (trades.length < total) {
        pagination.skip = skip;
        const page = await this.derivativeApi.fetchTrades({
          marketId,
          subaccountId: req.address,
        });

        skip = skip + 100;
        trades.concat(page.trades);
      }
    }

    if (req.orderId !== undefined) {
      return targetTrade ? [targetTrade] : [];
    } else {
      return trades;
    }
  }

  public async orders(
    req: PerpClobGetOrderRequest
  ): Promise<Array<DerivativeOrderHistory>> {
    const marketId = this.parsedMarkets[req.market].marketId;
    const orderTypes = [];
    if (req.orderTypes) {
      for (const orderTypeString of req.orderTypes.split(',')) {
        const orderType = enumFromStringValue(OrderSide, orderTypeString);
        if (orderType !== undefined) {
          orderTypes.push(orderType);
        }
      }
    }
    let direction = undefined;
    if (req.direction) {
      direction = enumFromStringValue(TradeDirection, req.direction);
    }

    let targetOrder = undefined;

    let skip = 0;
    let limit = 100;
    if (req.limit) {
      limit = req.limit;
    }
    const pagination = {
      skip,
      limit,
      key: '',
    };

    const firstPage = await this.derivativeApi.fetchOrderHistory({
      subaccountId: req.address,
      marketId,
      direction,
      orderTypes,
      pagination,
    });

    const orders = firstPage.orderHistory;
    if (req.orderId !== undefined) {
      for (const order of orders) {
        if (order.orderHash === req.orderId) {
          targetOrder = order;
          break;
        }
      }
    }

    const total = firstPage.pagination.total;
    if (total > 100 && limit >= 100) {
      skip = skip + 99;
      while (orders.length < total) {
        pagination.skip = skip;
        const page = await this.derivativeApi.fetchOrderHistory({
          subaccountId: req.address,
          marketId,
          direction,
          orderTypes,
          pagination,
        });
        if (req.orderId !== undefined) {
          for (const order of page.orderHistory) {
            if (order.orderHash === req.orderId) {
              targetOrder = order;
              break;
            }
          }
        }

        skip = skip + 100;
        orders.concat(page.orderHistory);
      }
    }

    if (req.orderId !== undefined) {
      return targetOrder ? [targetOrder] : [];
    } else {
      return orders;
    }
  }

  public static calculateMargin(
    price: string,
    quantity: string,
    decimals: number,
    leverage: number
  ): BigNumber {
    // margin = (price * quantity) / leverage
    const priceBig = utils.parseUnits(price, decimals);
    const quantityBig = utils.parseUnits(quantity, decimals);
    const leverageBig = utils.parseUnits(leverage.toString(), decimals);
    const decimalsBig = BigNumber.from(10).pow(decimals);

    const numerator = priceBig.mul(quantityBig).mul(decimalsBig);
    const denominator = leverageBig.mul(decimalsBig);

    return numerator.div(denominator);
  }

  public async postOrder(
    req: PerpClobPostOrderRequest
  ): Promise<{ txHash: string }> {
    return await this.orderUpdate(req);
  }

  public async deleteOrder(
    req: PerpClobDeleteOrderRequest
  ): Promise<{ txHash: string }> {
    return this.orderUpdate(req);
  }

  public async batchPerpOrders(
    req: PerpClobBatchUpdateRequest
  ): Promise<{ txHash: string }> {
    return this.orderUpdate(req);
  }

  public estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    return {
      gasPrice: this._chain.gasPrice,
      gasPriceToken: this._chain.nativeTokenSymbol,
      gasLimit: this.conf.gasLimitEstimate,
      gasCost: this._chain.gasPrice * this.conf.gasLimitEstimate,
    };
  }

  private _getNextHourUnixTimestamp(): number {
    // Returns the next hour unix timestamp in seconds.
    const now = Date.now() * 1e-3;
    return (now - (now % 3600) + 3600) * 1e3;
  }

  public async fundingInfo(
    req: PerpClobFundingInfoRequest
  ): Promise<FundingInfo> {
    // Ensures that the latest Derivative Market Info is loaded.
    await this.loadMarkets();

    const marketInfo = this.parsedMarkets[req.market];
    const marketId = marketInfo.marketId;
    const [baseSymbol, quoteSymbol] = req.market.split('-');
    const oracleType = marketInfo.oracleType;
    const oracleScaleFactor = parseFloat(`1e-${marketInfo.oracleScaleFactor}`);
    const nextFundingTimestamp =
      marketInfo.perpetualMarketInfo?.nextFundingTimestamp ||
      this._getNextHourUnixTimestamp();

    const fundingRateResp = await this.derivativeApi.fetchFundingRates({
      marketId,
    });
    const tradesResp = await this.derivativeApi.fetchTrades({
      marketId,
    });
    const oraclePriceResp = await this.oracleApi.fetchOraclePrice({
      baseSymbol,
      quoteSymbol,
      oracleType,
    });

    const indexPrice = (
      parseFloat(tradesResp.trades[0].executionPrice) * oracleScaleFactor
    ).toString();
    const fundingRate: string = fundingRateResp.fundingRates[0].rate;
    const markPrice = oraclePriceResp.price;

    return {
      marketId,
      indexPrice,
      markPrice,
      fundingRate,
      nextFundingTimestamp: nextFundingTimestamp * 1e3,
    };
  }

  public async fundingPayments(
    req: PerpClobFundingPaymentsRequest
  ): Promise<Array<FundingPayment>> {
    let skip = 0;
    const marketId = this.parsedMarkets[req.market].marketId;
    const pagination = {
      skip,
      limit: 100,
      key: '',
    };

    const firstPage = await this.derivativeApi.fetchFundingPayments({
      marketId,
      subaccountId: req.address,
      pagination,
    });

    const fundingPayments = firstPage.fundingPayments;

    const total = firstPage.pagination.total;
    if (total > 100) {
      skip = skip + 99;
      while (fundingPayments.length < total) {
        pagination.skip = skip;
        const page = await this.derivativeApi.fetchFundingPayments({
          marketId,
          subaccountId: req.address,
          pagination,
        });
        skip = skip + 100;
        fundingPayments.concat(page.fundingPayments);
      }
    }

    return fundingPayments;
  }

  public async positions(
    req: PerpClobPositionRequest
  ): Promise<Array<Position>> {
    const marketIds = [];
    for (const market of req.markets) {
      marketIds.push(this.parsedMarkets[market].marketId);
    }

    let skip = 0;
    const pagination = {
      skip,
      limit: 100,
      key: '',
    };

    const firstPage = await this.derivativeApi.fetchPositions({
      marketIds,
      subaccountId: req.address,
      pagination,
    });

    const positions = firstPage.positions;

    const total = firstPage.pagination.total;
    if (total > 100) {
      skip = skip + 99;
      while (positions.length < total) {
        pagination.skip = skip;
        const page = await this.derivativeApi.fetchPositions({
          marketIds,
          subaccountId: req.address,
          pagination,
        });
        skip = skip + 100;
        positions.concat(page.positions);
      }
    }

    return positions;
  }

  public buildPostOrder(
    orderParams: CreatePerpOrderParam[],
    injectiveAddress: string
  ): {
    orderType: GrpcOrderType;
    price: string;
    quantity: string;
    marketId: any;
    feeRecipient: string;
    margin: string;
  }[] {
    const derivativeOrdersToCreate = [];
    for (const order of orderParams) {
      const market = this.parsedMarkets[order.market];
      const [base, quote] = order.market.split('-');
      let orderType: GrpcOrderType = order.side === 'BUY' ? 1 : 2;
      orderType =
        order.orderType === 'LIMIT_MAKER'
          ? ((orderType + 6) as GrpcOrderType) // i.e. BUY_LIMIT, SELL_LIMIT are 7, 8 respectively
          : orderType;

      const price = derivativePriceToChainPriceToFixed({
        value: order.price,
        quoteDecimals: this._chain.getTokenForSymbol(quote)?.decimals,
      });
      const quantity = derivativeQuantityToChainQuantityToFixed({
        value: order.amount,
      });
      const baseToken = this._chain.getTokenForSymbol(base);
      const decimalForMargin = baseToken ? baseToken.decimals : 18;

      derivativeOrdersToCreate.push({
        orderType,
        price,
        quantity,
        marketId: market.marketId,
        feeRecipient: injectiveAddress,
        margin: utils.formatUnits(
          InjectiveClobPerp.calculateMargin(
            price,
            quantity,
            decimalForMargin,
            order.leverage
          ),
          decimalForMargin
        ),
      });
    }
    return derivativeOrdersToCreate;
  }

  public buildDeleteOrder(
    orders: ClobDeleteOrderRequestExtract[],
    injectiveAddress: string
  ): { marketId: any; subaccountId: string; orderHash: string }[] {
    const derivativeOrdersToCancel = [];
    for (const order of orders) {
      derivativeOrdersToCancel.push({
        marketId: this.parsedMarkets[order.market].marketId,
        subaccountId: injectiveAddress,
        orderHash: order.orderId,
      });
    }
    return derivativeOrdersToCancel;
  }

  public async orderUpdate(
    req:
      | PerpClobDeleteOrderRequest
      | PerpClobPostOrderRequest
      | PerpClobBatchUpdateRequest
  ): Promise<{ txHash: string }> {
    const wallet = await this._chain.getWallet(req.address);
    const privateKey: string = wallet.privateKey;
    const injectiveAddress: string = wallet.injectiveAddress;
    let derivativeOrdersToCreate: CreatePerpOrderParam[] = [];
    let derivativeOrdersToCancel: ClobDeleteOrderRequestExtract[] = [];
    if ('createOrderParams' in req)
      derivativeOrdersToCreate = derivativeOrdersToCreate.concat(
        req.createOrderParams as CreatePerpOrderParam[]
      );
    if ('price' in req)
      derivativeOrdersToCreate.push({
        price: req.price,
        amount: req.amount,
        orderType: req.orderType,
        side: req.side,
        market: req.market,
        leverage: req.leverage,
      });
    if ('cancelOrderParams' in req)
      derivativeOrdersToCancel = derivativeOrdersToCancel.concat(
        req.cancelOrderParams as ClobDeleteOrderRequestExtract[]
      );
    if ('orderId' in req)
      derivativeOrdersToCancel.push({
        orderId: req.orderId,
        market: req.market,
      });

    const msg = MsgBatchUpdateOrders.fromJSON({
      subaccountId: req.address,
      injectiveAddress,
      derivativeOrdersToCreate: this.buildPostOrder(
        derivativeOrdersToCreate,
        injectiveAddress
      ),
      derivativeOrdersToCancel: this.buildDeleteOrder(
        derivativeOrdersToCancel,
        req.address
      ),
    });

    const { txHash } = await this._chain.broadcaster(privateKey).broadcast({
      msgs: msg,
      injectiveAddress,
    });
    return { txHash };
  }
}

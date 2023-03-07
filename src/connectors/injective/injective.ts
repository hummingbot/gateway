import { BigNumber, utils } from 'ethers';
import {
  MsgBatchUpdateOrders,
  IndexerGrpcSpotApi,
  IndexerGrpcDerivativesApi,
  Orderbook,
  SpotOrderHistory,
  GrpcOrderType,
  FundingPayment,
  FundingRate,
  ExchangePagination,
  spotPriceToChainPriceToFixed,
  spotQuantityToChainQuantityToFixed,
  derivativePriceToChainPriceToFixed,
  derivativeQuantityToChainQuantityToFixed,
} from '@injectivelabs/sdk-ts';
import {
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobTickerRequest,
  ClobGetOrderRequest,
  ClobPostOrderRequest,
  ClobDeleteOrderRequest,
  CLOBMarkets,
  ClobGetOrderResponse,
  ClobFundingRatesRequest,
  ClobFundingPaymentsRequest,
} from '../../clob/clob.requests';
import { NetworkSelectionRequest } from '../../services/common-interfaces';
import { InjectiveCLOBConfig } from './injective.clob.config';
import { Injective } from '../../chains/injective/injective';
import LRUCache from 'lru-cache';
import { getInjectiveConfig } from '../../chains/injective/injective.config';

export class InjectiveCLOB {
  private static _instances: LRUCache<string, InjectiveCLOB>;
  private _chain;
  public conf;
  public spotApi: IndexerGrpcSpotApi;
  public derivativeApi: IndexerGrpcDerivativesApi;
  private _ready: boolean = false;
  public parsedMarkets: CLOBMarkets = {};

  private constructor(_chain: string, network: string) {
    this._chain = Injective.getInstance(network);
    this.conf = InjectiveCLOBConfig.config;
    this.spotApi = new IndexerGrpcSpotApi(this._chain.endpoints.indexer);
    this.derivativeApi = new IndexerGrpcDerivativesApi(
      this._chain.endpoints.indexer
    );
  }

  public static getInstance(chain: string, network: string): InjectiveCLOB {
    if (InjectiveCLOB._instances === undefined) {
      const config = getInjectiveConfig(network);
      InjectiveCLOB._instances = new LRUCache<string, InjectiveCLOB>({
        max: config.network.maxLRUCacheInstances,
      });
    }
    const instanceKey = chain + network;
    if (!InjectiveCLOB._instances.has(instanceKey)) {
      InjectiveCLOB._instances.set(
        instanceKey,
        new InjectiveCLOB(chain, network)
      );
    }

    return InjectiveCLOB._instances.get(instanceKey) as InjectiveCLOB;
  }

  public async loadMarkets() {
    const spotMarkets = await this.spotApi.fetchMarkets();
    for (const market of spotMarkets) {
      this.parsedMarkets[market.ticker.replace('/', '-')] = market;
    }
    const derivativeMarkets = await this.derivativeApi.fetchMarkets();
    for (const market of derivativeMarkets) {
      const key = market.ticker.replace('/', '-').replace(' PERP', '-PERP');
      this.parsedMarkets[key] = market;
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
    req: ClobMarketsRequest
  ): Promise<{ markets: CLOBMarkets }> {
    if (req.market && req.market.split('-').length === 2) {
      if (req.isDerivative === undefined || !req.isDerivative) {
        const resp: CLOBMarkets = {};
        resp[req.market] = this.parsedMarkets[req.market];
        return { markets: resp };
      } else if (req.isDerivative) {
        const resp: CLOBMarkets = {};
        resp[req.market] = this.parsedMarkets[req.market + '-PERP'];
        return { markets: resp };
      }
    }
    return { markets: this.parsedMarkets };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    if (req.isDerivative !== undefined && req.isDerivative) {
      return await this.derivativeApi.fetchOrderbook(
        this.parsedMarkets[req.market + '-PERP'].marketId
      );
    } else {
      return await this.spotApi.fetchOrderbook(
        this.parsedMarkets[req.market].marketId
      );
    }
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
    let marketId;
    if (req.isDerivative !== undefined && req.isDerivative) {
      marketId = this.parsedMarkets[req.market + '-PERP'].marketId;
    } else {
      marketId = this.parsedMarkets[req.market].marketId;
    }
    const orders: SpotOrderHistory[] = (
      await this.spotApi.fetchOrderHistory({
        subaccountId: req.address,
        marketId,
      })
    ).orderHistory;

    return { orders } as ClobGetOrderResponse;
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
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string }> {
    const [base, quote] = req.market.split('-');
    const wallet = await this._chain.getWallet(req.address);
    const privateKey: string = wallet.privateKey;
    const injectiveAddress: string = wallet.injectiveAddress;
    const market = this.parsedMarkets[req.market];
    let orderType: GrpcOrderType = req.side === 'BUY' ? 1 : 2;
    orderType =
      req.orderType === 'LIMIT_MAKER'
        ? ((orderType + 6) as GrpcOrderType) // i.e. BUY_LIMIT, SELL_LIMIT are 7, 8 respectively
        : orderType;

    let msg;
    if (req.leverage !== undefined) {
      const price = derivativePriceToChainPriceToFixed({
        value: req.price,
        quoteDecimals: this._chain.getTokenForSymbol(quote)?.decimals,
      });
      const quantity = derivativeQuantityToChainQuantityToFixed({
        value: req.amount,
      });

      const baseToken = this._chain.getTokenForSymbol(base);

      const decimalForMargin = baseToken ? baseToken.decimals : 18;

      msg = MsgBatchUpdateOrders.fromJSON({
        subaccountId: req.address,
        injectiveAddress,
        derivativeOrdersToCreate: [
          {
            orderType,
            price,
            quantity,
            marketId: market.marketId,
            feeRecipient: injectiveAddress,
            margin: utils.formatUnits(
              InjectiveCLOB.calculateMargin(
                price,
                quantity,
                decimalForMargin,
                req.leverage
              ),
              decimalForMargin
            ),
          },
        ],
      });
    } else {
      msg = MsgBatchUpdateOrders.fromJSON({
        subaccountId: req.address,
        injectiveAddress,
        spotOrdersToCreate: [
          {
            orderType,
            price: spotPriceToChainPriceToFixed({
              value: req.price,
              baseDecimals: this._chain.getTokenForSymbol(base)?.decimals,
              quoteDecimals: this._chain.getTokenForSymbol(quote)?.decimals,
            }),
            quantity: spotQuantityToChainQuantityToFixed({
              value: req.amount,
              baseDecimals: this._chain.getTokenForSymbol(base)?.decimals,
            }),
            marketId: market.marketId,
            feeRecipient: injectiveAddress,
          },
        ],
      });
    }

    const { txHash } = await this._chain.broadcaster(privateKey).broadcast({
      msgs: msg,
      injectiveAddress,
    });
    return { txHash };
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string }> {
    const wallet = await this._chain.getWallet(req.address);
    const privateKey: string = wallet.privateKey;
    const injectiveAddress: string = wallet.injectiveAddress;
    const market = this.parsedMarkets[req.market];

    let msg;
    if (req.isDerivative !== undefined && req.isDerivative === true) {
      msg = MsgBatchUpdateOrders.fromJSON({
        injectiveAddress,
        subaccountId: req.address,
        derivativeOrdersToCancel: [
          {
            marketId: market.marketId,
            subaccountId: req.address,
            orderHash: req.orderId,
          },
        ],
      });
    } else {
      msg = MsgBatchUpdateOrders.fromJSON({
        injectiveAddress,
        subaccountId: req.address,
        spotOrdersToCancel: [
          {
            marketId: market.marketId,
            subaccountId: req.address,
            orderHash: req.orderId,
          },
        ],
      });
    }

    const { txHash } = await this._chain.broadcaster(privateKey).broadcast({
      msgs: msg,
      injectiveAddress,
    });
    return { txHash };
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

  public async fundingRates(req: ClobFundingRatesRequest): Promise<{
    fundingRates: Array<FundingRate>;
    pagination: ExchangePagination;
  }> {
    return await this.derivativeApi.fetchFundingRates({
      marketId: req.marketId,
      pagination: { skip: req.skip, limit: req.limit, endTime: req.endTime },
    });
  }

  public async fundingPayments(req: ClobFundingPaymentsRequest): Promise<{
    fundingPayments: Array<FundingPayment>;
    pagination: ExchangePagination;
  }> {
    return await this.derivativeApi.fetchFundingPayments({
      marketId: req.marketId,
      pagination: { skip: req.skip, limit: req.limit, endTime: req.endTime },
    });
  }
}

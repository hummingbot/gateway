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
      this.parsedMarkets[market.ticker.replace('/', '-')] = market;
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
      const resp: CLOBMarkets = {};
      resp[req.market] = this.parsedMarkets[req.market];
      return { markets: resp };
    }
    return { markets: this.parsedMarkets };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    if (req.isDerivative !== undefined && req.isDerivative === true) {
      return await this.derivativeApi.fetchOrderbook(
        this.parsedMarkets[req.market].marketId
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
    const marketId = this.parsedMarkets[req.market].marketId;
    const orders: SpotOrderHistory[] = (
      await this.spotApi.fetchOrderHistory({
        subaccountId: req.address,
        marketId,
      })
    ).orderHistory;

    return { orders } as ClobGetOrderResponse;
  }

  // public static calculateMargin(price: string, quantity: string, decimals: number, leverage: number) {
  //   const leverageBigNumber = utils.parseUnits(leverage.toString(), decimals);
  //   BigNumber.mul div

  // export interface TokenInfo {
  //   address: string;
  //   chainId: number; // not all chains have chainId as a number, if it does not, come up with an internal number system.
  //   decimals: number;
  //   denom?: string; // this is a concept for injective, if it does not exist in a chain, set it to be the same as address or ignore it.
  //   name: string;
  //   symbol: string;
  // }

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
      // margin = (price * quantity) / leverage
      msg = MsgBatchUpdateOrders.fromJSON({
        subaccountId: req.address,
        injectiveAddress,
        derivativeOrdersToCreate: [
          {
            orderType,
            price: derivativePriceToChainPriceToFixed({
              value: req.price,
              decimalPlaces: this._chain.getTokenForSymbol(base)?.decimals, // TODO: reviewer double check this
              quoteDecimals: this._chain.getTokenForSymbol(quote)?.decimals,
            }),
            quantity: derivativeQuantityToChainQuantityToFixed({
              value: req.amount,
              decimalPlaces: this._chain.getTokenForSymbol(base)?.decimals, // TODO: reviewer double check this
            }),
            marketId: market.marketId,
            feeRecipient: injectiveAddress,
            margin: '', // TODO: calculate from leverage, waiting on injective team
            // NOTE: we are not using the optional field triggerPrice?
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
    /*

    derivativeOrdersToCreate?: {
      orderType: OrderTypeMap[keyof OrderTypeMap]
      triggerPrice?: string
      feeRecipient: string
      marketId: string
      price: string
      margin: string
      quantity: string
    }[]

derivativeMarginToChainMarginToFixed
derivativeMarginFromChainMarginToFixed
derivativePriceToChainPriceToFixed
derivativePriceFromChainPriceToFixed
derivativeQuantityToChainQuantityToFixed
derivativeQuantityFromChainQuantityToFixed
     */

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

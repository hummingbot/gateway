import { BigNumber, utils } from 'ethers';
import {
  MsgBatchUpdateOrders,
  IndexerGrpcDerivativesApi,
  DerivativeOrderHistory,
  Orderbook,
  GrpcOrderType,
  FundingPayment,
  FundingRate,
  ExchangePagination,
  Position,
  derivativePriceToChainPriceToFixed,
  derivativeQuantityToChainQuantityToFixed,
} from '@injectivelabs/sdk-ts';
import {
  PerpClobMarketRequest,
  PerpClobOrderbookRequest,
  PerpClobTickerRequest,
  PerpClobGetOrderRequest,
  PerpClobPostOrderRequest,
  PerpClobDeleteOrderRequest,
  PerpClobMarkets,
  PerpClobGetOrderResponse,
  PerpClobFundingRatesRequest,
  PerpClobFundingPaymentsRequest,
  PerpClobPositionRequest,
} from '../../clob/clob.requests';
import { NetworkSelectionRequest } from '../../services/common-interfaces';
import { InjectiveCLOBConfig } from '../injective/injective.clob.config';
import { Injective } from '../../chains/injective/injective';
import LRUCache from 'lru-cache';
import { getInjectiveConfig } from '../../chains/injective/injective.config';

export class InjectiveClobPerp {
  private static _instances: LRUCache<string, InjectiveClobPerp>;
  private _chain;
  public conf;
  public derivativeApi: IndexerGrpcDerivativesApi;
  private _ready: boolean = false;
  public parsedMarkets: PerpClobMarkets = {};

  private constructor(_chain: string, network: string) {
    this._chain = Injective.getInstance(network);
    this.conf = InjectiveCLOBConfig.config;
    this.derivativeApi = new IndexerGrpcDerivativesApi(
      this._chain.endpoints.indexer
    );
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
    return await this.derivativeApi.fetchOrderbook(
      this.parsedMarkets[req.market].marketId
    );
  }

  public async ticker(
    req: PerpClobTickerRequest
  ): Promise<{ markets: PerpClobMarkets }> {
    return await this.markets(req);
  }

  public async orders(
    req: PerpClobGetOrderRequest
  ): Promise<{ orders: PerpClobGetOrderResponse['orders'] }> {
    if (!req.market) return { orders: [] };
    const marketId = this.parsedMarkets[req.market].marketId;

    const orders: DerivativeOrderHistory[] = (
      await this.derivativeApi.fetchOrderHistory({
        subaccountId: req.address,
        marketId,
      })
    ).orderHistory;

    return { orders } as PerpClobGetOrderResponse;
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

    const price = derivativePriceToChainPriceToFixed({
      value: req.price,
      quoteDecimals: this._chain.getTokenForSymbol(quote)?.decimals,
    });
    const quantity = derivativeQuantityToChainQuantityToFixed({
      value: req.amount,
    });

    const baseToken = this._chain.getTokenForSymbol(base);

    const decimalForMargin = baseToken ? baseToken.decimals : 18;

    const msg = MsgBatchUpdateOrders.fromJSON({
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
            InjectiveClobPerp.calculateMargin(
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

    const { txHash } = await this._chain.broadcaster(privateKey).broadcast({
      msgs: msg,
      injectiveAddress,
    });
    return { txHash };
  }

  public async deleteOrder(
    req: PerpClobDeleteOrderRequest
  ): Promise<{ txHash: string }> {
    const wallet = await this._chain.getWallet(req.address);
    const privateKey: string = wallet.privateKey;
    const injectiveAddress: string = wallet.injectiveAddress;

    const market = this.parsedMarkets[req.market];

    const msg = MsgBatchUpdateOrders.fromJSON({
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

  public async fundingRates(req: PerpClobFundingRatesRequest): Promise<{
    fundingRates: Array<FundingRate>;
    pagination: ExchangePagination;
  }> {
    return await this.derivativeApi.fetchFundingRates({
      marketId: this.parsedMarkets[req.market].marketId,
      pagination: { skip: req.skip, limit: req.limit, endTime: req.endTime },
    });
  }

  public async fundingPayments(req: PerpClobFundingPaymentsRequest): Promise<{
    fundingPayments: Array<FundingPayment>;
    pagination: ExchangePagination;
  }> {
    return await this.derivativeApi.fetchFundingPayments({
      marketId: this.parsedMarkets[req.market].marketId,
      pagination: { skip: req.skip, limit: req.limit, endTime: req.endTime },
    });
  }

  public async positions(
    req: PerpClobPositionRequest
  ): Promise<Array<Position>> {
    let marketIds = [];
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
      while (total - 1 > skip) {
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
}

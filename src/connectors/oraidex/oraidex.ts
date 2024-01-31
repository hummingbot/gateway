import { MarketInfo, Oraichain } from '../../chains/oraichain/oraichain';
import {
  CLOBMarkets,
  ClobBatchUpdateRequest,
  ClobDeleteOrderRequest,
  ClobGetOrderRequest,
  ClobGetOrderResponse,
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobPostOrderRequest,
  ClobTickerRequest,
} from '../../clob/clob.requests';
import {
  CLOBish,
  NetworkSelectionRequest,
  Orderbook,
} from '../../services/common-interfaces';
import {
  getNotNullOrThrowError,
  isNativeDenom,
  parseToAssetInfo,
} from './oraidex.helper';

import {
  CancelOrdersRequest,
  Market,
  MarketNotFoundError,
  PlaceOrdersRequest,
} from './oraidex.types';
import { BigNumber } from 'bignumber.js';
import { OraiswapLimitOrderQueryClient } from '@oraichain/oraidex-contracts-sdk';
import { OraidexConfig } from './oraidex.config';
import { JsonObject, ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';

const ORDERBOOK_LIMIT = 100;
export class OraidexCLOB implements CLOBish {
  chain: string;

  network: string;

  public parsedMarkets: CLOBMarkets = {};

  private _swapLimitOrder: string;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private oraichainNetwork: Oraichain;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private orderbookQueryClient: OraiswapLimitOrderQueryClient;

  private _ready: boolean = false;
  private static _instances: { [name: string]: OraidexCLOB };

  private constructor(chain: string, network: string) {
    let config = OraidexConfig.config;

    this._swapLimitOrder = config.swapLimitOrder;
    this.chain = chain;
    this.network = network;
    this.oraichainNetwork = Oraichain.getInstance(network);
  }

  public static getInstance(chain: string, network: string): OraidexCLOB {
    if (OraidexCLOB._instances === undefined) {
      OraidexCLOB._instances = {};
    }

    const key = `${chain}:${network}`;

    if (!(key in OraidexCLOB._instances)) {
      OraidexCLOB._instances[key] = new OraidexCLOB(chain, network);
    }

    return OraidexCLOB._instances[key];
  }

  public static getConnectedInstances(): { [key: string]: OraidexCLOB } {
    return OraidexCLOB._instances;
  }

  async init() {
    this.oraichainNetwork = await Oraichain.getInstance(this.network);
    await this.oraichainNetwork.init();
    await this.loadMarkets();
    this.orderbookQueryClient = new OraiswapLimitOrderQueryClient(
      this.oraichainNetwork.cosmwasmClient,
      this._swapLimitOrder
    );
    this._ready = true;
  }

  ready(): boolean {
    return this._ready;
  }

  public async loadMarkets() {
    const rawMarkets = await this.fetchMarkets();
    for (const market of rawMarkets) {
      this.parsedMarkets[market.marketId] = market;
    }
  }

  async markets(_req: ClobMarketsRequest): Promise<{ markets: CLOBMarkets }> {
    return { markets: this.parsedMarkets };
  }

  async fetchMarkets(): Promise<Market[]> {
    const loadedMarkets: Market[] = [];
    const markets = this.oraichainNetwork.storedMarketList;

    markets.forEach(async (market) => {
      const processedMarket = await this.getMarket(market);

      loadedMarkets.push(processedMarket);
    });

    return loadedMarkets;
  }

  async getMarket(market: MarketInfo): Promise<Market> {
    if (!market) throw new MarketNotFoundError(`No market informed.`);

    // hotfix: hardcode market info
    return {
      marketId: market.marketId,
      baseToken: parseToAssetInfo(market.base.address),
      quoteToken: parseToAssetInfo(market.quote.address),
      min_quote_coin_amount: '0',
      spread: '0',
      fees: {
        maker: new BigNumber('0.1'),
        taker: new BigNumber('0.1'),
      },
    };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    return await this.getOrderBook(this.parsedMarkets[req.market]);
  }

  async getOrderBook(
    market: Market,
    limit: number = ORDERBOOK_LIMIT
  ): Promise<Orderbook> {
    const buys: any = [];
    const sells: any = [];

    let res = await this.orderbookQueryClient.orders({
      assetInfos: [market.baseToken, market.quoteToken],
      filter: 'none',
      limit,
    });

    res.orders.forEach((order) => {
      if (order.direction == 'buy') {
        let price = (
          parseFloat(order.offer_asset.amount) /
          parseFloat(order.ask_asset.amount)
        ).toString();
        let quantity = (
          Number(order.ask_asset.amount) - Number(order.filled_ask_amount)
        ).toString();

        buys.push({
          price,
          quantity,
          timestamp: Date.now(),
        });
      } else {
        let price = (
          parseFloat(order.ask_asset.amount) /
          parseFloat(order.offer_asset.amount)
        ).toString();
        let quantity = (
          Number(order.offer_asset.amount) - Number(order.filled_offer_amount)
        ).toString();

        sells.push({
          price,
          quantity,
          timestamp: Date.now(),
        });
      }
    });
    return { buys, sells };
  }

  public async ticker(
    req: ClobTickerRequest
  ): Promise<{ markets: CLOBMarkets }> {
    const requestMarket = getNotNullOrThrowError<string>(req.market);
    const midPrice = await this.getMidPriceForMarket(
      this.parsedMarkets[requestMarket]
    );
    return {
      markets: {
        market: this.parsedMarkets[requestMarket],
        price: midPrice,
        timestamp: Date.now(),
      },
    };
  }

  private async getMidPriceForMarket(market: Market) {
    const midPrice = await this.orderbookQueryClient.midPrice({
      assetInfos: [market.baseToken, market.quoteToken],
    });

    return midPrice;
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    const requestMarket = getNotNullOrThrowError<string>(req.market);
    const market = this.parsedMarkets[requestMarket];
    let originalOrders;

    if (req.address) {
      originalOrders = (
        await this.getAllOrders(
          market,
          getNotNullOrThrowError<string>(req.address)
        )
      ).orders;
    } else {
      const originalOrder = await this.orderbookQueryClient.order({
        orderId: Number(req.orderId),
        assetInfos: [market.baseToken, market.quoteToken],
      });
      originalOrders = [originalOrder];
    }
    return { orders: originalOrders };
  }

  public async getAllOrders(market: Market, owner: string) {
    const response: JsonObject = { orders: [] };
    let partialResponse: JsonObject;

    while (
      !partialResponse ||
      partialResponse.orders.length >= ORDERBOOK_LIMIT
    ) {
      partialResponse = await this.orderbookQueryClient.orders({
        assetInfos: [market.baseToken, market.quoteToken],
        filter: {
          bidder: owner,
        },
        limit: ORDERBOOK_LIMIT,
        startAfter: partialResponse
          ? partialResponse.orders[partialResponse.orders.length - 1].order_id
          : null,
      });

      response.orders = [...response.orders, ...partialResponse.orders];
    }

    return response;
  }

  async postOrder(
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string; id?: string }> {
    const convertedReq = {
      ownerAddress: req.address,
      orders: [req],
    };

    return { txHash: await this.placeOrders(convertedReq) };
  }

  public async batchOrders(req: ClobBatchUpdateRequest): Promise<any> {
    try {
      if (req.createOrderParams || req.cancelOrderParams) {
        if (req.createOrderParams) {
          const convertedReq = {
            ownerAddress: req.address,
            orders: req.createOrderParams,
          };
          return { txHash: await this.placeOrders(convertedReq) };
        } else if (req.cancelOrderParams) {
          const convertedReq = {
            ownerAddress: req.address,
            orders: req.cancelOrderParams,
          };
          return { txHash: await this.cancelOrders(convertedReq) };
        }
      }

      return {};
    } catch (err) {
      console.error(err);
    }
  }

  async placeOrders(options: PlaceOrdersRequest) {
    const instructions: ExecuteInstruction[] = [];
    const sender = options.ownerAddress;

    for (const order of options.orders) {
      const market = this.parsedMarkets[order.market] as Market;
      const baseToken = market.baseToken;
      const quoteToken = market.quoteToken;
      const quoteAmount = parseFloat(order.price) * parseFloat(order.amount);

      const assets = [
        { info: baseToken, amount: order.amount.toString() },
        { info: quoteToken, amount: quoteAmount.toString() },
      ];
      const submitOrderMsg = {
        submit_order: {
          assets,
          direction: order.side.toLowerCase(),
        },
      };

      if (order.side == 'BUY') {
        if (isNativeDenom(quoteToken)) {
          instructions.push({
            contractAddress: this._swapLimitOrder,
            msg: submitOrderMsg,
            funds: [
              {
                denom: getNotNullOrThrowError<string>(
                  (quoteToken as any).native_token.denom
                ),
                amount: quoteAmount.toString(),
              },
            ],
          });
        } else {
          instructions.push({
            contractAddress: (quoteToken as any).token.contract_addr,
            msg: {
              send: {
                contract: this._swapLimitOrder,
                amount: quoteAmount.toString(),
                msg: Buffer.from(JSON.stringify(submitOrderMsg)).toString(
                  'base64'
                ),
              },
            },
            funds: [],
          });
        }
      } else {
        if (isNativeDenom(baseToken)) {
          instructions.push({
            contractAddress: this._swapLimitOrder,
            msg: submitOrderMsg,
            funds: [
              {
                denom: getNotNullOrThrowError<string>(
                  (baseToken as any).native_token.denom
                ),
                amount: order.amount.toString(),
              },
            ],
          });
        } else {
          instructions.push({
            contractAddress: (baseToken as any).token.contract_addr,
            msg: {
              send: {
                contract: this._swapLimitOrder,
                amount: order.amount.toString(),
                msg: Buffer.from(JSON.stringify(submitOrderMsg)).toString(
                  'base64'
                ),
              },
            },
            funds: [],
          });
        }
      }
    }

    let res = await this.oraichainNetwork.executeContractMultiple(
      sender,
      instructions
    );

    return res.transactionHash;
  }

  async deleteOrder(req: ClobDeleteOrderRequest): Promise<{ txHash: string }> {
    const market = this.parsedMarkets[req.market] as Market;
    const baseToken = market.baseToken;
    const quoteToken = market.quoteToken;

    let res = await this.oraichainNetwork.executeContract(
      req.address,
      this._swapLimitOrder,
      {
        cancel_order: {
          asset_infos: [baseToken, quoteToken],
          order_id: Number(req.orderId),
        },
      },
      []
    );
    return { txHash: res.transactionHash };
  }

  async cancelOrders(options: CancelOrdersRequest) {
    const instructions: ExecuteInstruction[] = [];
    const sender = options.ownerAddress;

    for (const order of options.orders) {
      const market = this.parsedMarkets[order.market] as Market;
      const baseToken = market.baseToken;
      const quoteToken = market.quoteToken;

      instructions.push({
        contractAddress: this._swapLimitOrder,
        msg: {
          cancel_order: {
            asset_infos: [baseToken, quoteToken],
            order_id: Number(order.orderId),
          },
        },
        funds: [],
      });
    }

    let res = await this.oraichainNetwork.executeContractMultiple(
      sender,
      instructions
    );

    return res.transactionHash;
  }

  estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    return {
      gasCost: 0,
      gasLimit: 0,
      gasPrice: 0,
      gasPriceToken: 'orai',
    };
  }
}

import { KujiraModel } from './kujira.model';
import {
  CLOBish,
  MarketInfo,
  NetworkSelectionRequest,
  Orderbook,
} from '../../services/common-interfaces';
import {
  ClobBatchUpdateRequest,
  ClobDeleteOrderRequest,
  ClobGetOrderRequest,
  ClobGetOrderResponse,
  CLOBMarkets,
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobPostOrderRequest,
  ClobPostOrderResponse,
  ClobTickerRequest,
} from '../../clob/clob.requests';
import {
  convertClobBatchOrdersRequestToKujiraCancelOrdersRequest,
  convertClobBatchOrdersRequestToKujiraPlaceOrdersRequest,
  convertHumingbotMarketNameToMarketName,
  convertMarketNameToHumingbotMarketName,
} from './kujira.convertors';
import { getNotNullOrThrowError } from './kujira.helpers';
import {
  CancelOrdersResponse,
  GetAllMarketsResponse,
  IMap,
  Order,
  OrderAmount,
  OrderId,
  OrderPrice,
  OrderSide,
  OrderStatus,
  OrderTransactionHashes,
  OrderType,
  OwnerAddress,
  TransactionHash,
} from './kujira.types';
import { BigNumber } from 'bignumber.js';

export class KujiraCLOB implements CLOBish {
  chain: string;

  network: string;

  abiDecoder: any;

  public parsedMarkets: MarketInfo = {};

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private kujira: KujiraModel;

  private static _instances: { [name: string]: KujiraCLOB };

  private constructor(chain: string, network: string) {
    this.chain = chain;
    this.network = network;
  }

  public static getInstance(chain: string, network: string): KujiraCLOB {
    if (KujiraCLOB._instances === undefined) {
      KujiraCLOB._instances = {};
    }

    const key = `${chain}:${network}`;

    if (!(key in KujiraCLOB._instances)) {
      KujiraCLOB._instances[key] = new KujiraCLOB(chain, network);
    }

    return KujiraCLOB._instances[key];
  }

  public static getConnectedInstances(): { [key: string]: KujiraCLOB } {
    return KujiraCLOB._instances;
  }

  async init() {
    this.kujira = await KujiraModel.getInstance(this.chain, this.network);
    await this.kujira.init();
    await this.loadMarkets();
  }

  ready(): boolean {
    return this.kujira && this.kujira.isReady;
  }

  async deleteOrder(req: ClobDeleteOrderRequest): Promise<{ txHash: string }> {
    if (req.orderId) {
      const result = await this.kujira.cancelOrder({
        id: req.orderId,
        marketName: convertHumingbotMarketNameToMarketName(req.market),
        ownerAddress: req.address,
      });

      return {
        txHash: getNotNullOrThrowError<TransactionHash>(
          result.hashes?.cancellation
        ),
      };
    } else {
      const result = await this.kujira.cancelAllOrders({
        marketName: convertHumingbotMarketNameToMarketName(req.market),
        ownerAddress: req.address,
      });

      if (result.size) {
        const order: Order = getNotNullOrThrowError(result.first());
        const order_hash: OrderTransactionHashes =
          getNotNullOrThrowError<OrderTransactionHashes>(order.hashes);
        let hash: string | undefined;
        if ('creation' in order_hash) {
          hash = order_hash.creation;
        } else if ('cancellation' in order_hash) {
          hash = order_hash.cancellation;
        } else if ('withdraw' in order_hash) {
          hash = order_hash.withdraw;
        }

        return { txHash: getNotNullOrThrowError<string>(hash) };
      } else {
        return { txHash: '' };
      }
    }
  }

  estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    const result = this.kujira.getEstimatedFees({});

    return {
      gasCost: result.cost.toNumber(),
      gasLimit: result.limit.toNumber(),
      gasPrice: result.price.toNumber(),
      gasPriceToken: result.token,
    };
  }

  async loadMarkets(): Promise<void> {
    const allMarkets =
      (await this.kujira.getAllMarkets()) as GetAllMarketsResponse;

    for (const market of allMarkets.values()) {
      this.parsedMarkets[convertMarketNameToHumingbotMarketName(market.name)] =
        market;
    }
  }

  async markets(req: ClobMarketsRequest): Promise<{ markets: MarketInfo }> {
    if (req.market && req.market.split('-').length === 2) {
      const resp: CLOBMarkets = {};
      resp[req.market] = this.parsedMarkets[req.market];

      return { markets: resp };
    }

    return { markets: this.parsedMarkets };
  }

  async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    const orderBook = await this.kujira.getOrderBook({
      marketName: convertHumingbotMarketNameToMarketName(req.market),
    });

    const buys = [];
    for (const order of orderBook.bids.valueSeq()) {
      buys.push({
        price: getNotNullOrThrowError<OrderPrice>(order.price).toString(),
        quantity: getNotNullOrThrowError<OrderAmount>(order.amount).toString(),
        timestamp: order.creationTimestamp ? order.creationTimestamp : 0,
      });
    }

    const sells = [];
    for (const order of orderBook.asks.valueSeq()) {
      sells.push({
        price: getNotNullOrThrowError<OrderPrice>(order.price).toString(),
        quantity: getNotNullOrThrowError<OrderAmount>(order.amount).toString(),
        timestamp: order.creationTimestamp ? order.creationTimestamp : 0,
      });
    }

    return { buys, sells };
  }

  async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    let originalOrders;

    if (req.orderId) {
      const originalOrder = await this.kujira.getOrder({
        id: req.orderId,
        marketName: convertHumingbotMarketNameToMarketName(req.market),
        ownerAddress: getNotNullOrThrowError<OwnerAddress>(req.address),
      });

      originalOrders = [originalOrder];
    } else {
      originalOrders = getNotNullOrThrowError<IMap<OrderId, Order>>(
        await this.kujira.getOrders({
          marketName: convertHumingbotMarketNameToMarketName(req.market),
          ownerAddress: getNotNullOrThrowError<OwnerAddress>(req.address),
        })
      )
        .valueSeq()
        .toArray();
    }

    const orders = [];

    for (const originalOrder of originalOrders) {
      if (originalOrder) {
        const order = {
          id: getNotNullOrThrowError<OrderId>(originalOrder.id),
          clientId: originalOrder.clientId,
          orderHash: '',
          marketId: originalOrder.marketId,
          active: '',
          subaccountId: '',
          executionType: '',
          orderType: getNotNullOrThrowError<OrderType>(originalOrder.type),
          price: getNotNullOrThrowError<OrderPrice>(
            originalOrder.price
          ).toString(),
          triggerPrice: '',
          quantity: originalOrder.amount.toString(),
          filledQuantity: '',
          state: getNotNullOrThrowError<OrderStatus>(originalOrder.status),
          createdAt: originalOrder.creationTimestamp
            ? originalOrder.creationTimestamp.toString()
            : '',
          updatedAt: originalOrder.fillingTimestamp
            ? originalOrder.fillingTimestamp.toString()
            : '',
          direction: originalOrder.side,
        };

        orders.push(order);
      }
    }

    return { orders } as {
      orders:
        | [
            {
              [key: string]: string;
            }
          ]
        | [];
    };
  }

  async postOrder(
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string; id?: string }> {
    const result = await this.kujira.placeOrder({
      clientId: req.clientOrderID,
      marketName: convertHumingbotMarketNameToMarketName(req.market),
      ownerAddress: req.address,
      side: req.side as OrderSide,
      price: BigNumber(req.price),
      amount: BigNumber(req.amount),
      type: req.orderType as OrderType,
    });

    return {
      txHash: getNotNullOrThrowError<string>(result.hashes?.creation),
      id: result.id,
    };
  }

  public async ticker(
    req: ClobTickerRequest
  ): Promise<{ markets: MarketInfo }> {
    const requestMarket = getNotNullOrThrowError<string>(req.market);
    const ticker = await this.kujira.getTicker({
      marketName: convertHumingbotMarketNameToMarketName(requestMarket),
    });
    const marketMap: { [key: string]: any } = {};
    marketMap[requestMarket] = {
      market: ticker.market,
      ticker: ticker.ticker,
      price: ticker.price,
      timestamp: ticker.timestamp,
    };

    return { markets: marketMap };
  }

  // noinspection JSUnusedGlobalSymbols
  public async batchOrders(req: ClobBatchUpdateRequest): Promise<any> {
    try {
      if (req.createOrderParams || req.cancelOrderParams) {
        if (req.createOrderParams) {
          const convertedReq = {
            chain: req.chain,
            network: req.network,
            ownerAddress: req.address,
            orders: convertClobBatchOrdersRequestToKujiraPlaceOrdersRequest(
              req.createOrderParams
            ),
          };
          const originalResponse = await this.kujira.placeOrders(convertedReq);
          return {
            network: this.network,
            timestamp: 0,
            latency: 0,
            txHash: getNotNullOrThrowError<string>(
              originalResponse.first()?.hashes?.creation
            ),
            ids: originalResponse.valueSeq().map((order) => order.id),
          } as ClobPostOrderResponse;
        } else if (req.cancelOrderParams) {
          const convertedReq =
            convertClobBatchOrdersRequestToKujiraCancelOrdersRequest(req);
          const originalResponse: CancelOrdersResponse =
            await this.kujira.cancelOrders(convertedReq);
          return {
            network: this.network,
            timestamp: 0,
            latency: 0,
            txHash: getNotNullOrThrowError<string>(
              getNotNullOrThrowError<IMap<OrderId, Order>>(
                originalResponse
              ).first()?.hashes?.cancellation
            ),
            ids: getNotNullOrThrowError<IMap<OrderId, Order>>(originalResponse)
              .valueSeq()
              .map((order) => order.id),
          } as ClobPostOrderResponse;
        }
      }

      return {};
    } catch (error) {
      console.error(error);
    }
  }
}

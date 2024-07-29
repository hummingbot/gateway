import { Ethereum } from '../../chains/ethereum/ethereum';
import {
  ClobMarketsRequest,
  ClobOrderbookRequest,
  ClobTickerRequest,
  ClobGetOrderRequest,
  ClobPostOrderRequest,
  ClobDeleteOrderRequest,
  ClobGetOrderResponse,
  ClobBatchUpdateRequest,
  CreateOrderParam,
  ClobDeleteOrderRequestExtract,
} from '../../clob/clob.requests';
import {
  CLOBish,
  MarketInfo,
  NetworkSelectionRequest,
  Orderbook,
} from '../../services/common-interfaces';

export class RubiconCLOB implements CLOBish {
  private _chain;
  private _ready: boolean = false;
  public parsedMarkets: MarketInfo = [];

  private constructor(chain: string, network: string) {
    if (chain === 'ethereum') {
      this._chain = Ethereum.getInstance(network);
    } else throw Error('Chain not supported.');
  }

  public async loadMarkets() {

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
  ): Promise<{ markets: MarketInfo }> {
    if (req.market && req.market in this.parsedMarkets)
      return { markets: this.parsedMarkets[req.market] };
    return { markets: Object.values(this.parsedMarkets) };
  }

  public async orderBook(req: ClobOrderbookRequest): Promise<Orderbook> {
    return {
      buys: [],
      sells: []
    }
  }

  public async ticker(
    req: ClobTickerRequest
  ): Promise<{ markets: MarketInfo }> {
    return await this.markets(req);
  }

  public async orders(
    req: ClobGetOrderRequest
  ): Promise<{ orders: [] }> {
    return {
      orders: []
    }
  }

  public async postOrder(
    req: ClobPostOrderRequest
  ): Promise<{ txHash: string; id: string }> {
    return { txHash: "", id: "" };
  }

  public async deleteOrder(
    req: ClobDeleteOrderRequest
  ): Promise<{ txHash: string, id: string }> {
    return { txHash: "", id: "" };
  }

  public estimateGas(_req: NetworkSelectionRequest): {
    gasPrice: number;
    gasPriceToken: string;
    gasLimit: number;
    gasCost: number;
  } {
    return {
      gasPrice: 0,
      gasPriceToken: "eth",
      gasLimit: 0,
      gasCost: 0,
    };
  }
}

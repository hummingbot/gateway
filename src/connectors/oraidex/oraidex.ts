import {
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
  MarketInfo,
  NetworkSelectionRequest,
  Orderbook,
} from '../../services/common-interfaces';

export class OraidexCLOB implements CLOBish {
  chain: string;

  network: string;

  public parsedMarkets: MarketInfo = {};

  private _ready: boolean = false;
  private static _instances: { [name: string]: OraidexCLOB };

  private constructor(chain: string, network: string) {
    this.chain = chain;
    this.network = network;
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
    // this.kujira = await KujiraModel.getInstance(this.chain, this.network);
    // await this.kujira.init();
    // await this.loadMarkets();
    this._ready = true;
  }

  ready(): boolean {
    return this._ready;
  }

  public async loadMarkets() {
    // const rawMarkets = await this.fetchMarkets();
    // for (const market of rawMarkets) {
    //   this.parsedMarkets[market.marketId] = market;
    // }
  }

  async markets(_req: ClobMarketsRequest): Promise<{ markets: MarketInfo }> {
    return { markets: this.parsedMarkets };
  }

  public async orderBook(_req: ClobOrderbookRequest): Promise<Orderbook> {
    const buys: any = [];
    const sells: any = [];
    return { buys, sells };
  }

  public async ticker(
    _req: ClobTickerRequest
  ): Promise<{ markets: MarketInfo }> {
    return { markets: {} };
  }

  public async orders(
    _req: ClobGetOrderRequest
  ): Promise<{ orders: ClobGetOrderResponse['orders'] }> {
    return { orders: [] };
  }

  async postOrder(
    _req: ClobPostOrderRequest
  ): Promise<{ txHash: string; id?: string }> {
    return { txHash: '' };
  }

  async deleteOrder(_req: ClobDeleteOrderRequest): Promise<{ txHash: string }> {
    return { txHash: '' };
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

import { Tezosish } from '../../services/common-interfaces';
import { TezosBase } from './tezos.base';
import { getTezosConfig } from './tezos.config';
import { logger } from '../../services/logger';


export class Tezos extends TezosBase implements Tezosish {
  private static _instances: { [name: string]: Tezos };
  private _gasPrice: number;
  private _gasLimitTransaction: number;
  private _nativeTokenSymbol: string;
  private _chain: string;
  private _requestCount: number;
  private _metricsLogInterval: number;
  private _metricTimer;

  constructor(network: string) {
    super(network);
    const config = getTezosConfig('tezos', network);
    this._chain = network;
    this._nativeTokenSymbol = config.nativeCurrencySymbol;

    this._gasPrice = config.manualGasPrice;
    this._gasLimitTransaction = config.gasLimitTransaction;

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this._metricTimer = setInterval(
      this.metricLogger.bind(this),
      this.metricsLogInterval
    );
  }

  public static getInstance(network: string): Tezos {
    if (Tezos._instances === undefined) {
      Tezos._instances = {};
    }
    if (!(network in Tezos._instances)) {
      Tezos._instances[network] = new Tezos(network);
    }

    return Tezos._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Tezos } {
    return Tezos._instances;
  }

  public requestCounter(msg: any): void {
    if (msg.action === 'request') this._requestCount += 1;
  }

  public metricLogger(): void {
    logger.info(
      this.requestCount +
      ' request(s) sent in last ' +
      this.metricsLogInterval / 1000 +
      ' seconds.'
    );
    this._requestCount = 0; // reset
  }

  public get gasPrice(): number {
    return this._gasPrice;
  }

  public get gasLimitTransaction() {
    return this._gasLimitTransaction;
  }

  public get chain(): string {
    return this._chain;
  }

  public get nativeTokenSymbol(): string {
    return this._nativeTokenSymbol;
  }

  public get requestCount(): number {
    return this._requestCount;
  }

  public get metricsLogInterval(): number {
    return this._metricsLogInterval;
  }

  async close() {
    clearInterval(this._metricTimer);
  }
}

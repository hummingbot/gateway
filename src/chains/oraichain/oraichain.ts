import { Cosmosish } from '../../services/common-interfaces';
import { CosmosBase } from '../cosmos/cosmos-base';
import { getOraichainConfig } from './oraichain.config';
import { logger } from '../../services/logger';
import { MarketListType, TokenInfo } from '../../services/base';
import axios from 'axios';
import { promises as fs } from 'fs';
import { OraichainController } from './oraichain.controller';
import {
  JsonObject,
  CosmWasmClient,
  SigningCosmWasmClient,
  ExecuteInstruction,
} from '@cosmjs/cosmwasm-stargate';
import * as cosmwasm from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import { Decimal } from '@cosmjs/math';

export type MarketInfo = {
  id: number;
  marketId: string;
  base: TokenInfo;
  quote: TokenInfo;
};

export class Oraichain extends CosmosBase implements Cosmosish {
  private static _instances: { [name: string]: Oraichain };
  private _rpcUrl: string;
  private _gasPrice: number;
  private _gasLimit: number;
  private _nativeTokenSymbol: string;
  private _chain: string;
  private _requestCount: number;
  private _metricsLogInterval: number;
  private _metricTimer;
  private _marketListSource: string;
  private _marketListType: MarketListType;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private _cosmwasmClient: CosmWasmClient;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private _signCosmwasmClient: SigningCosmWasmClient;

  public controller;

  protected marketList: MarketInfo[] = [];
  private _marketMap: Record<string, MarketInfo[]> = {};

  private constructor(network: string) {
    const config = getOraichainConfig('oraichain', network);

    super(
      'oraichain',
      config.network.rpcURL,
      config.network.tokenListSource,
      config.network.tokenListType,
      config.manualGasPrice
    );
    this._rpcUrl = config.network.rpcURL;
    this._chain = network;
    this._nativeTokenSymbol = config.nativeCurrencySymbol;
    this._marketListSource = config.network.marketListSource;
    this._marketListType = <MarketListType>config.network.marketListType;

    this._gasPrice = config.manualGasPrice;
    this._gasLimit = config.gasLimit;

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this._metricTimer = setInterval(
      this.metricLogger.bind(this),
      this.metricsLogInterval
    );
    this.controller = OraichainController;
  }

  public static getInstance(network: string): Oraichain {
    if (Oraichain._instances === undefined) {
      Oraichain._instances = {};
    }
    if (!(network in Oraichain._instances)) {
      Oraichain._instances[network] = new Oraichain(network);
    }
    return Oraichain._instances[network];
  }

  async init(): Promise<void> {
    if (!this.ready()) {
      await super.init();
      await this.loadMarkets(this._marketListSource, this._marketListType);
      //init cosmwasm client
      this._cosmwasmClient = await cosmwasm.SigningCosmWasmClient.connect(
        this._rpcUrl
      );
    }
  }

  async loadMarkets(
    marketListSource: string,
    marketListType: MarketListType
  ): Promise<void> {
    this.marketList = await this.getMarketList(
      marketListSource,
      marketListType
    );
    if (this.marketList) {
      this.marketList.forEach((market: MarketInfo) => {
        if (!this._marketMap[market.marketId]) {
          this._marketMap[market.marketId] = [];
        }

        this._marketMap[market.marketId].push(market);
      });
    }
  }

  async getMarketList(
    marketListSource: string,
    marketListType: MarketListType
  ): Promise<MarketInfo[]> {
    let markets;
    if (marketListType === 'URL') {
      const resp = await axios.get(marketListSource);
      markets = resp.data.tokens;
    } else {
      markets = JSON.parse(await fs.readFile(marketListSource, 'utf8'));
    }
    return markets;
  }

  public static getConnectedInstances(): { [name: string]: Oraichain } {
    return Oraichain._instances;
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

  public async queryContractSmart(
    address: string,
    query: JsonObject
  ): Promise<JsonObject> {
    return await this._cosmwasmClient.queryContractSmart(address, query);
  }

  public async executeContract(
    sender: string,
    contractAddress: string,
    msg: JsonObject,
    funds: any
  ): Promise<JsonObject> {
    let walletCommon: any = await this.getWallet(sender, 'orai');

    const wallet = await DirectSecp256k1Wallet.fromKey(
      walletCommon.privkey,
      'orai'
    );

    const client = await cosmwasm.SigningCosmWasmClient.connectWithSigner(
      this._rpcUrl,
      wallet,
      {
        gasPrice: new GasPrice(Decimal.fromUserInput('0.001', 6), 'orai'),
      }
    );

    let res = await client.execute(
      sender,
      contractAddress,
      msg,
      'auto',
      undefined,
      funds
    );

    return res;
  }
  public async executeContractMultiple(
    sender: string,
    instructions: ExecuteInstruction[]
  ): Promise<JsonObject> {
    let walletCommon: any = await this.getWallet(sender, 'orai');

    const wallet = await DirectSecp256k1Wallet.fromKey(
      walletCommon.privkey,
      'orai'
    );

    const client = await cosmwasm.SigningCosmWasmClient.connectWithSigner(
      this._rpcUrl,
      wallet,
      {
        gasPrice: new GasPrice(Decimal.fromUserInput('0.001', 6), 'orai'),
      }
    );

    let res = await client.executeMultiple(sender, instructions, 'auto');

    return res;
  }

  public get gasPrice(): number {
    return this._gasPrice;
  }

  public get gasLimit(): number {
    return this._gasLimit;
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

  public get storedMarketList(): MarketInfo[] {
    return this.marketList;
  }

  public get cosmwasmClient(): CosmWasmClient {
    return this._cosmwasmClient;
  }
  public get signCosmwasmClient(): SigningCosmWasmClient {
    return this._signCosmwasmClient;
  }

  async close() {
    clearInterval(this._metricTimer);
    if (this._chain in Oraichain._instances) {
      delete Oraichain._instances[this._chain];
    }
  }
}

import { Cosmosish } from '../../services/common-interfaces';
import { CosmosBase } from '../cosmos/cosmos-base';
import { getOraichainConfig } from './oraichain.config';
import { logger } from '../../services/logger';
import { TokenInfo, TokenValue } from '../../services/base';
import fse from 'fs-extra';
import { OraichainController } from './oraichain.controller';
import {
  JsonObject,
  CosmWasmClient,
  SigningCosmWasmClient,
  ExecuteInstruction,
} from '@cosmjs/cosmwasm-stargate';
import * as cosmwasm from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { GasPrice, StargateClient, setupIbcExtension } from '@cosmjs/stargate';
import { BigNumber } from 'ethers';

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
  private _nativeTokenSymbol: string;
  private _chain: string;
  private _requestCount: number;
  private _metricsLogInterval: number;
  private _metricTimer;
  private _signers: Map<string, SigningCosmWasmClient> = new Map();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private _cosmwasmClient: CosmWasmClient;

  public controller;

  protected marketList: MarketInfo[] = [];

  private constructor(network: string) {
    const config = getOraichainConfig('oraichain', network);

    super(
      'oraichain',
      config.network.rpcURL,
      config.network.tokenListSource,
      config.network.tokenListType,
      config.manualGasPrice,
    );
    this._rpcUrl = config.network.rpcURL;
    this._chain = network;
    this._nativeTokenSymbol = config.nativeCurrencySymbol;

    this._gasPrice = config.manualGasPrice;

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this._metricTimer = setInterval(
      this.metricLogger.bind(this),
      this.metricsLogInterval,
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
      await this.initSigningCosmWasmClient();
      //init cosmwasm client
      this._cosmwasmClient = await cosmwasm.SigningCosmWasmClient.connect(
        this._rpcUrl,
      );
    }
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
        ' seconds.',
    );
    this._requestCount = 0; // reset
  }

  public async queryContractSmart(
    address: string,
    query: JsonObject,
  ): Promise<JsonObject> {
    return await this._cosmwasmClient.queryContractSmart(address, query);
  }

  public async initSigningCosmWasmClient(): Promise<void> {
    if (!fse.pathExistsSync('conf/wallets/oraichain')) {
      return;
    }

    fse.readdirSync('conf/wallets/oraichain').forEach(async (file) => {
      const address = file.split('.')[0];
      const client = await this.createSigningCosmWasmClient(file.split('.')[0]);

      this._signers.set(address, client);
    });
  }

  public async createSigningCosmWasmClient(
    address: string,
  ): Promise<SigningCosmWasmClient> {
    const walletCommon: any = await this.getWallet(address, 'orai');

    const wallet = await DirectSecp256k1Wallet.fromKey(
      walletCommon.privkey,
      'orai',
    );

    return await cosmwasm.SigningCosmWasmClient.connectWithSigner(
      this._rpcUrl,
      wallet,
      {
        gasPrice: GasPrice.fromString('0.001orai'),
        broadcastPollIntervalMs: 500,
      },
    );
  }

  public async getSigningClient(
    address: string,
  ): Promise<SigningCosmWasmClient> {
    let client = this._signers.get(address);

    if (!client) {
      client = await this.createSigningCosmWasmClient(address);
      this._signers.set(address, client);
    }
    return client;
  }

  public async executeContract(
    sender: string,
    contractAddress: string,
    msg: JsonObject,
    funds: any,
  ): Promise<JsonObject> {
    const client = await this.getSigningClient(sender);

    const res = await client.execute(
      sender,
      contractAddress,
      msg,
      'auto',
      undefined,
      funds,
    );

    return res;
  }

  public async executeContractMultiple(
    sender: string,
    instructions: ExecuteInstruction[],
  ): Promise<JsonObject> {
    const client = await this.getSigningClient(sender);

    const res = await client.executeMultiple(sender, instructions, 'auto');

    return res;
  }

  async getBalance(address: string): Promise<Record<string, TokenValue>> {
    const provider = await StargateClient.connect(this._rpcUrl);

    const balances: Record<string, TokenValue> = {};

    const allTokens = await provider.getAllBalances(address);

    await Promise.all(
      allTokens.map(async (t: { denom: string; amount: string }) => {
        let token = this.getTokenByBase(t.denom);

        if (!token && t.denom.startsWith('ibc/')) {
          const ibcHash: string = t.denom.replace('ibc/', '');

          // Get base denom by IBC hash
          if (ibcHash) {
            const { denomTrace } = await setupIbcExtension(
              await (provider as any).queryClient,
            ).ibc.transfer.denomTrace(ibcHash);
            if (denomTrace) {
              const { baseDenom } = denomTrace;
              token = this.getTokenByBase(baseDenom);
            }
          }
        }

        // Not all tokens are added in the registry so we use the denom if the token doesn't exist
        balances[token ? token.symbol : t.denom] = {
          value: BigNumber.from(parseInt(t.amount, 10)),
          decimals: this.getTokenDecimals(token),
        };
      }),
    );

    return balances;
  }

  public get gasPrice(): number {
    return this._gasPrice;
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

  async close() {
    clearInterval(this._metricTimer);
    if (this._chain in Oraichain._instances) {
      delete Oraichain._instances[this._chain];
    }
  }
}

import {
  NetworkPrefix,
  SecretKey,
  SecretKeys,
  Wallet,
} from 'ergo-lib-wasm-nodejs';
import LRUCache from 'lru-cache';
import { ErgoController } from './ergo.controller';
import { NodeService } from './node.service';
import { getErgoConfig } from './ergo.config';
import { DexService } from './dex.service';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  ErgoAccount,
  ErgoAsset,
  ErgoBox,
  ErgoConnectedInstance,
} from './interfaces/ergo.interface';
import { AmmPool, makeNativePools } from '@ergolabs/ergo-dex-sdk';
import { Explorer, RustModule } from '@ergolabs/ergo-sdk';

async function x() {
  await RustModule.load(true);
}
x();

class Pool extends AmmPool {
  private name: string;

  constructor(public pool: AmmPool) {
    super(pool.id, pool.lp, pool.x, pool.y, pool.poolFeeNum);

    this.name = `${this.x.asset.name}/${this.y.asset.name}`;
  }

  public getName() {
    return this.name;
  }

  // calculatePriceImpact(input: any): number {
  //   const ratio =
  //     input.asset.id === this.x.asset.id
  //       ? math.evaluate!(
  //         `${renderFractions(this.y.amount.valueOf(), this.y.asset.decimals)} / ${renderFractions(this.x.amount.valueOf(), this.x.asset.decimals)}`,
  //       ).toString()
  //       : math.evaluate!(
  //         `${renderFractions(this.x.amount.valueOf(), this.x.asset.decimals)} / ${renderFractions(this.y.amount.valueOf(), this.y.asset.decimals)}`,
  //       ).toString();
  //   const outputAmount = calculatePureOutputAmount(input, this);
  //   const outputRatio = math.evaluate!(
  //     `${outputAmount} / ${renderFractions(input.amount, input.asset.decimals)}`,
  //   ).toString();
  //
  //   return Math.abs(
  //     math.evaluate!(`(${outputRatio} * 100 / ${ratio}) - 100`).toFixed(2),
  //   );
  // }
}

export class Ergo {
  private _assetMap: Record<string, ErgoAsset> = {};
  private static _instances: LRUCache<string, Ergo>;
  private _chain: string = 'ergo';
  private _network: string;
  private _networkPrefix: NetworkPrefix;
  private _node: NodeService;
  private _explorer: Explorer;
  private _dex: DexService;
  private _ready: boolean = false;
  public txFee: number;
  public controller: ErgoController;
  private utxosLimit: number;
  private poolLimit: number;
  private ammPools: Array<Pool> = [];

  constructor(network: string) {
    const config = getErgoConfig(network);

    if (network === 'Mainnet') {
      this._networkPrefix = NetworkPrefix.Mainnet;
    } else {
      this._networkPrefix = NetworkPrefix.Testnet;
    }

    this._network = network;
    this._node = new NodeService(
      config.network.nodeURL,
      config.network.timeOut,
    );
    this._explorer = new Explorer(config.network.explorerURL);
    this._dex = new DexService(
      config.network.explorerDEXURL,
      config.network.timeOut,
    );
    this.controller = ErgoController;
    this.txFee = config.network.minTxFee;
    this.utxosLimit = config.network.utxosLimit;
    this.poolLimit = config.network.poolLimit;
  }

  public get node(): NodeService {
    return this._node;
  }

  public get network(): string {
    return this._network;
  }

  public get storedAssetList(): Array<ErgoAsset> {
    return Object.values(this._assetMap);
  }

  public ready(): boolean {
    return this._ready;
  }

  public async init(): Promise<void> {
    await this.loadAssets();
    await this.loadPools();
    this._ready = true;
    return;
  }

  async close() {
    return;
  }

  public static getInstance(network: string): Ergo {
    const config = getErgoConfig(network);

    if (!Ergo._instances) {
      Ergo._instances = new LRUCache<string, Ergo>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Ergo._instances.has(config.network.name)) {
      if (network) {
        Ergo._instances.set(config.network.name, new Ergo(network));
      } else {
        throw new Error(
          `Ergo.getInstance received an unexpected network: ${network}.`,
        );
      }
    }

    return Ergo._instances.get(config.network.name) as Ergo;
  }

  public static getConnectedInstances(): ErgoConnectedInstance {
    const connectedInstances: ErgoConnectedInstance = {};

    if (this._instances) {
      const keys = Array.from(this._instances.keys());

      for (const instance of keys) {
        if (instance) {
          connectedInstances[instance] = this._instances.get(instance) as Ergo;
        }
      }
    }

    return connectedInstances;
  }

  async getCurrentBlockNumber(): Promise<number> {
    const status = await this._node.getNetworkHeight();
    return status + 1;
  }

  async getAddressUnspentBoxes(address: string) {
    let utxos: Array<ErgoBox> = [];
    let offset = 0;
    let nodeBoxes = await this._node.getUnspentBoxesByAddress(
      address,
      offset,
      this.utxosLimit,
    );

    while (nodeBoxes.length > 0) {
      utxos = [...utxos, ...nodeBoxes];
      offset += this.utxosLimit;
      nodeBoxes = await this._node.getUnspentBoxesByAddress(
        address,
        offset,
        this.utxosLimit,
      );
    }

    return utxos;
  }

  public getAccountFromSecretKey(secret: string): ErgoAccount {
    const sks = new SecretKeys();
    const secretKey = SecretKey.dlog_from_bytes(Buffer.from(secret, 'hex'));
    const address = secretKey.get_address().to_base58(this._networkPrefix);

    sks.add(secretKey);

    const wallet = Wallet.from_secrets(sks);

    return {
      address,
      wallet,
    };
  }

  public encrypt(secret: string, password: string): string {
    const iv = randomBytes(16);
    const key = Buffer.alloc(32);

    key.write(password);

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  public decrypt(encryptedSecret: string, password: string): string {
    const [iv, encryptedKey] = encryptedSecret.split(':');
    const key = Buffer.alloc(32);

    key.write(password);

    const decipher = createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(iv, 'hex'),
    );
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedKey, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString();
  }

  public async getAssetBalance(
    account: ErgoAccount,
    assetName: string,
  ): Promise<string> {
    const ergoAsset = this._assetMap[assetName];
    let balance = 0;

    try {
      const utxos = await this.getAddressUnspentBoxes(account.address);

      balance = utxos.reduce(
        (total: number, box) =>
          total +
          box.assets
            .filter((asset) => asset.tokenId === ergoAsset.tokenId.toString())
            .reduce(
              (total_asset, asset) => total_asset + Number(asset.amount),
              0,
            ),
        0,
      );
    } catch (error: any) {
      throw new Error(
        `problem during finding account assets ${this._chain} Node!`,
      );
    }

    return balance.toString();
  }

  private async loadAssets() {
    const assetData = await this.getAssetData();

    for (const result of assetData.tokens) {
      this._assetMap[result.name.toUpperCase()] = {
        tokenId: result.address,
        decimals: result.decimals,
        name: result.name,
        symbol: result.ticker,
      };
    }
  }

  private async getAssetData() {
    return await this._dex.getTokens();
  }

  private async loadPools(): Promise<void> {
    let offset = 0;
    let pools: Array<Pool> = await this.getPoolData(this.poolLimit, offset);
    while (pools.length > 0) {
      for (const pool of pools) {
        if (!this.ammPools.filter((ammPool) => ammPool.id === pool.id).length) {
          this.ammPools.push(pool);
        }
      }

      offset += this.poolLimit;
      pools = await this.getPoolData(this.poolLimit, offset);
    }
  }

  private async getPoolData(limit: number, offset: number): Promise<any> {
    const [AmmPool] = await makeNativePools(this._explorer).getAll({
      limit,
      offset,
    });
    return AmmPool;
  }

  public get storedTokenList() {
    return this._assetMap;
  }
}

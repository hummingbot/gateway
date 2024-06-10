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
import { toNumber } from 'lodash';
import { AmmPool, makeNativePools } from '@ergolabs/ergo-dex-sdk';
import { Explorer } from '@ergolabs/ergo-sdk';

class Pool extends AmmPool {
  private name: string;

  constructor(public pool: AmmPool) {
    super(pool.id, pool.lp, pool.x, pool.y, pool.poolFeeNum);

    this.name = `${this.x.asset.name}/${this.y.asset.name}`;
  }

  private getName() {
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

/**
 * Ergo chain class
 * @param {string} network - mainnet or testnet
 * @class
 */
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

  public get ready(): boolean {
    return this._ready;
  }

  /**
   * This function initializes the Ergo class' instance
   * @returns
   * @function
   * @async
   */
  public async init(): Promise<void> {
    await this.loadAssets();
    await this.loadPools();
    this._ready = true;
    return;
  }

  async close() {
    return;
  }

  /**
   * This static function returns the exists or create new Ergo class' instance based on the network
   * @param {string} network - mainnet or testnet
   * @returns Ergo
   * @function
   * @static
   */
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

  /**
   * This static function returns the connected instances
   * @returns ErgoConnectedInstance
   * @function
   * @static
   */
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

  /**
   * This function returns the current network height(Block number)
   * @returns number
   * @function
   * @async
   */
  async getCurrentBlockNumber(): Promise<number> {
    const status = await this._node.getNetworkHeight();
    return status + 1;
  }

  /**
   * This function returns the unspent boxes based on the address from node
   * @returns ErgoBox[]
   * @function
   * @async
   */
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

  /**
   * Retrieves Ergo Account from secret key
   * @param {string} secret - Secret key
   * @returns ErgoAccount
   * @function
   */
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

  /**
   * Encrypt secret via password
   * @param {string} secret - Secret key
   * @param {string} password - password
   * @returns string
   * @function
   */
  public encrypt(secret: string, password: string): string {
    const iv = randomBytes(16);
    const key = Buffer.alloc(32);

    key.write(password);

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt encrypted secret key via password
   * @param {string} encryptedSecret - Secret key
   * @param {string} password - password
   * @returns string
   * @function
   */
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

  /**
   *  Gets asset balance from unspent boxes
   * @param {ErgoAccount} account
   * @param {string} assetName
   * @returns string
   * @function
   * @async
   */
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
        tokenId: toNumber(result.address),
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

      offset += this.utxosLimit;
      pools = await this.getPoolData(this.poolLimit, offset);
    }
  }

  private async getPoolData(limit: number, offset: number): Promise<any> {
    return await makeNativePools(this._explorer).getAll({ limit, offset });
  }

  /**
   *  Returns a map of asset name and Ergo Asset
   * @returns assetMap
   */
  public get storedTokenList() {
    return this._assetMap;
  }
}

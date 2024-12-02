import {
  NetworkPrefix,
  SecretKey,
  SecretKeys,
  Wallet,
  Mnemonic,
  ExtSecretKey,
  DerivationPath,
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
  ErgoTxFull,
} from './interfaces/ergo.interface';
import {
  AmmPool,
  makeNativePools,
  makeWrappedNativePoolActionsSelector,
  SwapExtremums,
  SwapParams,
  swapVars,
} from '@patternglobal/ergo-dex-sdk';
import {
  Explorer,
  DefaultTxAssembler,
  AssetAmount,
  publicKeyFromAddress,
  TransactionContext,
  RustModule, BoxSelection
} from "@patternglobal/ergo-sdk";
import { NativeExFeeType } from '@patternglobal/ergo-dex-sdk/build/main/types';
import { NetworkContext } from '@patternglobal/ergo-sdk/build/main/entities/networkContext';
import { ErgoNetwork } from './types/ergo.type';
import { getBaseInputParameters, getInputs, getTxContext } from './ergo.util';
import { WalletProver } from './wallet-prover.service';
import { BigNumber } from 'bignumber.js';
import { PriceResponse, TradeResponse } from '../../amm/amm.requests';
import { walletPath } from '../../services/base';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { HttpException, SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE, SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE } from '../../services/error-handler';

/**
 * Extended AmmPool class with additional properties and methods
 */
class Pool extends AmmPool {
  private _name: string;

  constructor(public pool: AmmPool) {
    super(pool.id, pool.lp, pool.x, pool.y, pool.poolFeeNum);
    this._name = `${this.pool.x.asset.name}/${this.pool.y.asset.name}`;
  }

  public get name() {
    return this._name;
  }

  public get info() {
    return {
      id: this.id,
      lp: this.lp,
      x: this.x,
      y: this.y,
      feeNum: this.feeNum,
      feeDenom: this.feeDenom,
    };
  }
}

/**
 * Main Ergo class for interacting with the Ergo blockchain
 */
export class Ergo {
  private static _instances: LRUCache<string, Ergo>;
  private _assetMap: Record<string, ErgoAsset> = {};
  private _chain: string = 'ergo';
  private _network: ErgoNetwork;
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

  /**
   * Creates an instance of Ergo.
   * @param {ErgoNetwork} network - The Ergo network to connect to ('mainnet' or 'testnet')
   */
  constructor(network: ErgoNetwork) {
    if (network !== 'mainnet' && network !== 'testnet') {
      throw new Error('network should be `mainnet` or `testnet`');
    }

    const config = getErgoConfig(network);

    this._networkPrefix = config.network.networkPrefix;
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

  /**
   * Gets the node service
   * @returns {NodeService}
   */
  public get node(): NodeService {
    return this._node;
  }

  /**
   * Gets the current network
   * @returns {ErgoNetwork}
   */
  public get network(): ErgoNetwork {
    return this._network;
  }

  /**
   * Gets the list of stored assets
   * @returns {Array<ErgoAsset>}
   */
  public get storedAssetList(): Array<ErgoAsset> {
    return Object.values(this._assetMap);
  }

  /**
   * Checks if the Ergo instance is ready
   * @returns {boolean}
   */
  public ready(): boolean {
    return this._ready;
  }

  /**
   * Gets the current network height
   * @returns {Promise<number>}
   */
  public async getNetworkHeight() {
    return await this._node.getNetworkHeight();
  }

  /**
   * Initializes the Ergo instance
   * @returns {Promise<void>}
   */
  public async init(): Promise<void> {
    await RustModule.load(true);
    await this.loadAssets();
    await this.loadPools();
    this._ready = true;
    return;
  }

  /**
   * Closes the Ergo instance (placeholder for future implementation)
   * @returns {Promise<void>}
   */
  async close() {
    return;
  }

  /**
   * Gets or creates an Ergo instance
   * @param {ErgoNetwork} network - The network to connect to
   * @returns {Ergo}
   * @static
   */
  public static getInstance(network: ErgoNetwork): Ergo {
    if (network !== 'mainnet' && network !== 'testnet') {
      throw new Error('network should be `mainnet` or `testnet`');
    }

    const config = getErgoConfig(network);

    if (!Ergo._instances) {
      Ergo._instances = new LRUCache<string, Ergo>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Ergo._instances.has(config.network.name)) {
      Ergo._instances.set(config.network.name, new Ergo(network));
    }

    return Ergo._instances.get(config.network.name) as Ergo;
  }

  /**
   * Gets all connected Ergo instances
   * @returns {ErgoConnectedInstance}
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
   * Gets the current block number
   * @returns {Promise<number>}
   */
  async getCurrentBlockNumber(): Promise<number> {
    const status = await this._node.getNetworkHeight();
    return status + 1;
  }

  /**
   * Gets unspent boxes for a given address
   * @param {string} address - The address to get unspent boxes for
   * @returns {Promise<ErgoBox[]>}
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
   * Gets an Ergo account from a secret key
   * @param {string} secret - The secret key
   * @returns {ErgoAccount}
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
      prover: new WalletProver(wallet, this._node),
    };
  }

  /**
   * Gets an Ergo account from a mnemonic phrase
   * @param {string} mnemonic - The mnemonic phrase
   * @returns {ErgoAccount}
   */
  public getAccountFromMnemonic(mnemonic: string): ErgoAccount {
    const sks = new SecretKeys();
    const seed = Mnemonic.to_seed(mnemonic, '');
    const rootSecret = ExtSecretKey.derive_master(seed);
    const changePath = DerivationPath.new(0, new Uint32Array([0]));
    const secretKeyBytes = rootSecret.derive(changePath).secret_key_bytes();
    const secretKey = SecretKey.dlog_from_bytes(secretKeyBytes);
    const address = secretKey.get_address().to_base58(this._networkPrefix);

    sks.add(secretKey);

    const wallet = Wallet.from_secrets(sks);

    return {
      address,
      wallet,
      prover: new WalletProver(wallet, this._node),
    };
  }

  /**
   * Encrypts a secret using a password
   * @param {string} secret - The secret to encrypt
   * @param {string} password - The password to use for encryption
   * @returns {string} The encrypted secret
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
   * Gets an Ergo account from an address
   * @param {string} address - The address to get the account for
   * @returns {Promise<ErgoAccount>}
   */
  public async getAccountFromAddress(address: string): Promise<ErgoAccount> {
    const path = `${walletPath}/${this._chain}`;
    const encryptedMnemonic: string = await fse.readFile(
      `${path}/${address}.json`,
      'utf8',
    );
    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }
    const mnemonic = this.decrypt(encryptedMnemonic, passphrase);
    return this.getAccountFromMnemonic(mnemonic);
  }

  /**
   * Decrypts an encrypted secret using a password
   * @param {string} encryptedSecret - The encrypted secret
   * @param {string} password - The password to use for decryption
   * @returns {string} The decrypted secret
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
   * Gets the balance of a specific asset for an account
   * @param {ErgoAccount} account - The account to get the balance for
   * @param {string} assetName - The name of the asset
   * @returns {Promise<string>} The balance of the asset
   */
  public async getAssetBalance(
    account: ErgoAccount,
    assetName: string,
  ): Promise<string> {
    const ergoAsset = this._assetMap[assetName.toUpperCase()];
    let balance = BigNumber(0);
    if (!ergoAsset) throw new Error(`assetName not found ${this._chain} Node!`);
    try {
      const utxos = await this.getAddressUnspentBoxes(account.address);
      balance = utxos.reduce(
        (total: BigNumber, box) =>
          total.plus(
            box.assets
              .filter((asset) => asset.tokenId === ergoAsset.tokenId.toString())
              .reduce(
                (total_asset, asset) =>
                  total_asset.plus(BigNumber(asset.amount)),
                BigNumber(0),
              ),
          ),
        BigNumber(0),
      );
    } catch (error: any) {
      throw new Error(
        `problem during finding account assets ${this._chain} Node!`,
      );
    }

    return balance.toString();
  }

  /**
   * Gets the balance of ERG and assets from unspent boxes
   * @param {ErgoBox[]} utxos - The unspent transaction outputs
   * @returns {{ balance: BigNumber, assets: Record<string, BigNumber> }}
   */
  public getBalance(utxos: ErgoBox[]) {
    const balance = utxos.reduce(
      (total, box) => total.plus(BigNumber(box.value)),
      BigNumber(0),
    );
    const assets: Record<string, BigNumber> = {};

    utxos.forEach((box) => {
      box.assets.forEach((asset) => {
        if (Object.keys(assets).includes(asset.tokenId))
          assets[asset.tokenId] = assets[asset.tokenId].plus(
            BigNumber(asset.amount),
          );
        else assets[asset.tokenId] = BigNumber(asset.amount);
      });
    });

    return { balance, assets };
  }

  /**
   * Loads assets from the DEX
   * @private
   */
  private async loadAssets() {
    const assetData = await this.getAssetData();

    for (const result of assetData.tokens) {
      this._assetMap[result.name.toUpperCase()] = {
        tokenId: result.address,
        decimals: result.decimals,
        name: result.name,
        symbol: result.ticker.toUpperCase(),
      };
    }

    this._assetMap['ERGO'] = {
      tokenId:
        '0000000000000000000000000000000000000000000000000000000000000000',
      decimals: 9,
      name: 'ERGO',
      symbol: 'ERG',
    };
  }

  /**
   * Retrieves asset data from the DEX
   * @private
   * @returns {Promise<any>} Asset data
   */
  private async getAssetData() {
    return await this._dex.getTokens();
  }

  /**
   * Loads AMM pools
   * @private
   */
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

  /**
   * Loads a specific pool by ID
   * @param {string} poolId - The ID of the pool to load
   */
  public async loadPool(poolId: string): Promise<void> {
    await RustModule.load(true);
    const pool = await this.getPool(poolId);

    if (!pool) {
      const new_pool = await makeNativePools(this._explorer).get(poolId);
      if (!new_pool)
        throw new Error(`can not get pool with this id: ${poolId}`);
      this.ammPools.push(new Pool(new_pool));
    }
  }

  /**
   * Retrieves pool data
   * @private
   * @param {number} limit - The number of pools to retrieve
   * @param {number} offset - The offset for pagination
   * @returns {Promise<any>} Pool data
   */
  private async getPoolData(limit: number, offset: number): Promise<any> {
    const [AmmPool] = await makeNativePools(this._explorer).getAll({
      limit,
      offset,
    });

    return AmmPool;
  }

  /**
   * Gets the stored token list
   * @returns {Record<string, ErgoAsset>} Stored token list
   */
  public get storedTokenList() {
    return this._assetMap;
  }


  /**
   * Performs a swap operation
   * @param {ErgoAccount} account - The account performing the swap
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} value - The amount to swap
   * @param {string} output_address - The address to receive the output
   * @param {string} return_address - The address for change return
   * @param {number} [slippage] - The slippage tolerance
   * @returns {Promise<TradeResponse>} The trade response
   */
  public async swap(
    account: ErgoAccount,
    baseToken: string,
    quoteToken: string,
    value: BigNumber,
    output_address: string,
    return_address: string,
    priceLimit: string,
  ): Promise<TradeResponse> {
    const config = getErgoConfig(this.network);
    const slippage = config.network.defaultSlippage;
    const { realBaseToken, realQuoteToken, pool } = await this.findBestPool(baseToken, quoteToken, value, slippage);
    const { sell, amount, from, to, minOutput } = this.calculateSwapParameters(pool, realBaseToken, value, slippage);
    const { baseInput, baseInputAmount } = getBaseInputParameters(pool, { inputAmount: from, slippage: slippage || config.network.defaultSlippage });

    const networkContext = await this._explorer.getNetworkContext();
    const txAssembler = new DefaultTxAssembler(this.network === 'mainnet');
    const poolActions = this.getPoolActions(output_address, account, txAssembler);

    const utxos = await this.getAddressUnspentBoxes(account.address);
    const swapVariables = this.calculateSwapVariables(config, minOutput);
    const inputs = this.prepareInputs(utxos, from, baseInputAmount, config, swapVariables[1]);

    const swapParams = this.createSwapParams(pool, output_address, baseInput, to, swapVariables, config);
    const txContext = this.createTxContext(inputs, networkContext, return_address, config);

    const actions = poolActions(pool);
    const timestamp = await this.getBlockTimestamp(networkContext);
    const tx = await actions.swap(swapParams, txContext);
    const xDecimals = pool.x.asset.decimals as number;
    const yDecimals = pool.y.asset.decimals as number;
    const realPrice = this.calculatePrice(
      minOutput,
      from,
      sell,
      xDecimals,
      yDecimals,
    );
    if (
      (sell && BigNumber(priceLimit).gt(BigNumber(realPrice))) ||
      (!sell && BigNumber(priceLimit).lt(BigNumber(realPrice)))
    ) {
      console.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
          BigNumber(realPrice).toString(),
          BigNumber(priceLimit).toString(),
        ),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
      );
    }

    await this.submitTransaction(account, tx);

    return this.createTradeResponse(realBaseToken, realQuoteToken, amount, from, minOutput, pool, sell, config, timestamp, tx);
  }

  /**
   * Estimates the price for a swap
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} value - The amount to swap
   * @param {number} [slippage] - The slippage tolerance
   * @returns {Promise<PriceResponse>} The price estimate
   */
  public async estimate(
    baseToken: string,
    quoteToken: string,
    value: BigNumber,
  ): Promise<PriceResponse> {
    const config = getErgoConfig(this.network);
    const slippage = config.network.defaultSlippage;
    const { realBaseToken, realQuoteToken, pool } = await this.findBestPool(baseToken, quoteToken, value, slippage);
    const { sell, amount, from, minOutput } = this.calculateSwapParameters(pool, realBaseToken, value, slippage);

    const expectedAmount = this.calculateExpectedAmount(minOutput, pool, sell);

    return this.createPriceResponse(realBaseToken, realQuoteToken, amount, from, minOutput, pool, sell, config, expectedAmount);
  }

  /**
   * Finds the best pool for a given token pair and amount
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} value - The amount to swap
   * @param {number} [slippage] - The slippage tolerance
   * @returns {Promise<{ realBaseToken: ErgoAsset, realQuoteToken: ErgoAsset, pool: Pool }>}
   */
  private async findBestPool(baseToken: string, quoteToken: string, value: BigNumber, slippage?: number): Promise<{ realBaseToken: ErgoAsset, realQuoteToken: ErgoAsset, pool: Pool }> {
    const pools = this.getPoolByToken(baseToken, quoteToken);
    if (!pools.length) throw new Error(`Pool not found for ${baseToken} and ${quoteToken}`);

    const realBaseToken = this.findToken(baseToken);
    const realQuoteToken = this.findToken(quoteToken);
    if (!realBaseToken || !realQuoteToken) throw new Error(`Pool not found for ${baseToken} and ${quoteToken}`)
    let bestPool: Pool | null = null;
    let bestExpectedOut = BigNumber(0);

    for (const pool of pools) {
      const { minOutput } = this.calculateSwapParameters(pool, realBaseToken, value, slippage);
      const expectedOut = this.calculateExpectedAmount(minOutput, pool, pool.x.asset.id !== realBaseToken.tokenId);

      if (expectedOut.gt(bestExpectedOut)) {
        bestPool = pool;
        bestExpectedOut = expectedOut;
      }
    }

    if (!bestPool) throw new Error(`No suitable pool found for ${baseToken} and ${quoteToken}`);

    return { realBaseToken, realQuoteToken, pool: bestPool };
  }

  /**
   * Finds a token by its symbol
   * @param {string} symbol - The token symbol
   * @returns {ErgoAsset}
   */
  private findToken(symbol: string): ErgoAsset | undefined {
    const token = this.storedAssetList.find(asset => asset.symbol === symbol);
    return token;
  }

  /**
   * Calculates swap parameters for a given pool and amount
   * @param {Pool} pool - The pool to use for the swap
   * @param {ErgoAsset} baseToken - The base token
   * @param {BigNumber} value - The amount to swap
   * @param {number} [slippage] - The slippage tolerance
   * @returns {{ sell: boolean, amount: BigNumber, from: any, to: any, minOutput: any }}
   */
  private calculateSwapParameters(pool: Pool, baseToken: ErgoAsset, value: BigNumber, slippage?: number) {
    const config = getErgoConfig(this.network);
    const sell = pool.x.asset.id !== baseToken.tokenId;
    const amount = this.calculateAmount(pool, value, sell);

    const max_to = {
      asset: { id: sell ? pool.x.asset.id : pool.y.asset.id },
      amount: BigInt(amount.toString()),
    };

    const from = {
      asset: {
        id: sell ? pool.y.asset.id : pool.x.asset.id,
        decimals: sell ? pool.y.asset.decimals : pool.x.asset.decimals,
      },
      amount: pool.outputAmount(max_to as any, slippage || config.network.defaultSlippage).amount,
    };
    if (from.amount === BigInt(0))
      throw new Error(`${amount} asset from ${max_to.asset.id} is not enough!`);
    const to = {
      asset: {
        id: sell ? pool.x.asset.id : pool.y.asset.id,
        decimals: sell ? pool.x.asset.decimals : pool.y.asset.decimals,
      },
      amount: BigInt(amount.toString()),
    };

    const { minOutput } = getBaseInputParameters(pool, {
      inputAmount: from,
      slippage: slippage || config.network.defaultSlippage,
    });

    return { sell, amount, from, to, minOutput };
  }

  /**
   * Calculates the amount with proper decimals
   * @param {Pool} pool - The pool to use for the calculation
   * @param {BigNumber} value - The input value
   * @param {boolean} sell - Whether it's a sell operation
   * @returns {BigNumber}
   */
  private calculateAmount(pool: Pool, value: BigNumber, sell: boolean): BigNumber {
    const decimals = sell ? pool.x.asset.decimals : pool.y.asset.decimals;
    return value.multipliedBy(BigNumber(10).pow(decimals as number));
  }

  /**
   * Calculates the expected amount from the minimum output
   * @param {any} minOutput - The minimum output
   * @param {Pool} pool - The pool used for the swap
   * @param {boolean} sell - Whether it's a sell operation
   * @returns {BigNumber}
   */
  private calculateExpectedAmount(minOutput: any, pool: Pool, sell: boolean): BigNumber {
    const decimals = sell ? pool.x.asset.decimals : pool.y.asset.decimals;
    return BigNumber(minOutput.amount.toString()).div(BigNumber(10).pow(decimals as number));
  }

  /**
   * Gets pool actions for the swap
   * @param {string} output_address - The output address
   * @param {ErgoAccount} account - The account performing the swap
   * @param {DefaultTxAssembler} txAssembler - The transaction assembler
   * @returns {Function}
   */
  private getPoolActions(output_address: string, account: ErgoAccount, txAssembler: DefaultTxAssembler) {
    return makeWrappedNativePoolActionsSelector(output_address, account.prover, txAssembler);
  }

  /**
   * Calculates swap variables
   * @param {any} config - The Ergo configuration
   * @param {any} minOutput - The minimum output
   * @returns {[number, SwapExtremums]}
   */
  private calculateSwapVariables(config: any, minOutput: any): [number, SwapExtremums] {
    const swapVariables = swapVars(
      BigInt(config.network.defaultMinerFee.multipliedBy(3).toString()),
      config.network.minNitro,
      minOutput,
    );
    if (!swapVariables) throw new Error('Error in swap vars!');
    return swapVariables;
  }

  /**
   * Prepares inputs for the swap
   * @param {any[]} utxos - The unspent transaction outputs
   * @param {any} from - The from asset
   * @param {BigInt} baseInputAmount - The base input amount
   * @param {any} config - The Ergo configuration
   * @param {SwapExtremums} extremum - The swap extremums
   * @returns {any[]}
   */
  private prepareInputs(utxos: any[], from: any, baseInputAmount: BigNumber, config: any, extremum: SwapExtremums): BoxSelection {
    return getInputs(
      utxos.map((utxo) => ({
        ...utxo,
        value: BigNumber(utxo.value),
        assets: utxo.assets.map((asset: any) => ({
          ...asset,
          amount: BigNumber(asset.amount),
        })),
      })),
      [new AssetAmount(from.asset, BigInt(baseInputAmount.toString()))],
      {
        minerFee: BigInt(config.network.defaultMinerFee.toString()),
        uiFee: BigInt(config.network.defaultMinerFee.toString()),
        exFee: BigInt(extremum.maxExFee.toString()),
      },
    );
  }

  /**
   * Creates swap parameters
   * @param {Pool} pool - The pool to use for the swap
   * @param {string} output_address - The output address
   * @param {any} baseInput - The base input
   * @param {any} to - The to asset
   * @param {[number, SwapExtremums]} swapVariables - The swap variables
   * @param {any} config - The Ergo configuration
   * @returns {SwapParams<NativeExFeeType>}
   */
  private createSwapParams(pool: Pool, output_address: string, baseInput: any, to: any, swapVariables: [number, SwapExtremums], config: any): SwapParams<NativeExFeeType> {
    const [exFeePerToken, extremum] = swapVariables;
    const pk = publicKeyFromAddress(output_address);
    if (!pk) throw new Error(`output_address is not defined.`);

    return {
      poolId: pool.id,
      pk,
      baseInput,
      minQuoteOutput: extremum.minOutput.amount,
      exFeePerToken,
      uiFee: BigInt(config.network.defaultMinerFee.toString()),
      quoteAsset: to.asset.id,
      poolFeeNum: pool.poolFeeNum,
      maxExFee: extremum.maxExFee,
    };
  }

  /**
   * Creates transaction context
   * @param {any[]} inputs - The transaction inputs
   * @param {NetworkContext} networkContext - The network context
   * @param {string} return_address - The return address
   * @param {any} config - The Ergo configuration
   * @returns {TransactionContext}
   */
  private createTxContext(inputs: BoxSelection, networkContext: NetworkContext, return_address: string, config: any): TransactionContext {
    return getTxContext(
      inputs,
      networkContext,
      return_address,
      BigInt(config.network.defaultMinerFee.toString()),
    );
  }

  /**
   * Gets the block timestamp
   * @param {NetworkContext} networkContext - The network context
   * @returns {Promise<number>}
   */
  private async getBlockTimestamp(networkContext: NetworkContext): Promise<number> {
    const blockInfo = await this._node.getBlockInfo(networkContext.height.toString());
    return blockInfo.header.timestamp;
  }

  /**
   * Submits a transaction
   * @param {ErgoAccount} account - The account submitting the transaction
   * @param {any} tx - The transaction to submit
   */
  private async submitTransaction(account: ErgoAccount, tx: any): Promise<void> {
    const submit_tx = await account.prover.submit(tx);
    if (!submit_tx.id) throw new Error(`Error during submit tx!`);
  }

  /**
   * Creates a trade response
   * @param {ErgoAsset} realBaseToken - The base token
   * @param {ErgoAsset} realQuoteToken - The quote token
   * @param {BigNumber} amount - The amount
   * @param {any} from - The from asset
   * @param {any} minOutput - The minimum output
   * @param {Pool} pool - The pool used for the swap
   * @param {boolean} sell - Whether it's a sell operation
   * @param {any} config - The Ergo configuration
   * @param {number} timestamp - The transaction timestamp
   * @param {any} tx - The transaction
   * @returns {TradeResponse}
   */
  private createTradeResponse(
    realBaseToken: ErgoAsset,
    realQuoteToken: ErgoAsset,
    amount: BigNumber,
    from: any,
    minOutput: any,
    pool: Pool,
    sell: boolean,
    config: any,
    timestamp: number,
    tx: any
  ): TradeResponse {
    const xDecimals = pool.x.asset.decimals as number;
    const yDecimals = pool.y.asset.decimals as number;

    return {
      network: this.network,
      timestamp,
      latency: 0,
      base: realBaseToken.symbol,
      quote: realQuoteToken.symbol,
      amount: this.formatAmount(amount, sell ? xDecimals : yDecimals),
      rawAmount: this.formatAmount(amount, sell ? xDecimals : yDecimals),
      expectedOut: this.formatAmount(BigNumber(minOutput.amount.toString()), sell ? xDecimals : yDecimals),
      price: this.calculatePrice(minOutput, from, sell, xDecimals, yDecimals),
      gasPrice: this.calculateGas(config.network.minTxFee),
      gasPriceToken: 'ERG',
      gasLimit: this.calculateGas(config.network.minTxFee),
      gasCost: this.calculateGas(config.network.minTxFee).toString(),
      txHash: tx.id,
    };
  }

  /**
   * Creates a price response
   * @param {ErgoAsset} realBaseToken - The base token
   * @param {ErgoAsset} realQuoteToken - The quote token
   * @param {BigNumber} amount - The amount
   * @param {any} from - The from asset
   * @param {any} minOutput - The minimum output
   * @param {Pool} pool - The pool used for the swap
   * @param {boolean} sell - Whether it's a sell operation
   * @param {any} config - The Ergo configuration
   * @param {BigNumber} expectedAmount - The expected amount
   * @returns {PriceResponse}
   */
  private createPriceResponse(
    realBaseToken: ErgoAsset,
    realQuoteToken: ErgoAsset,
    amount: BigNumber,
    from: any,
    minOutput: any,
    pool: Pool,
    sell: boolean,
    config: any,
    expectedAmount: BigNumber
  ): PriceResponse {
    const xDecimals = pool.x.asset.decimals as number;
    const yDecimals = pool.y.asset.decimals as number;

    return {
      base: realBaseToken.symbol,
      quote: realQuoteToken.symbol,
      amount: this.formatAmount(amount, sell ? xDecimals : yDecimals),
      rawAmount: this.formatAmount(amount, sell ? xDecimals : yDecimals),
      expectedAmount: expectedAmount.toString(),
      price: this.calculatePrice(minOutput, from, sell, xDecimals, yDecimals),
      network: this.network,
      timestamp: Date.now(),
      latency: 0,
      gasPrice: this.calculateGas(config.network.minTxFee),
      gasPriceToken: 'ERG',
      gasLimit: this.calculateGas(config.network.minTxFee),
      gasCost: this.calculateGas(config.network.minTxFee).toString(),
    };
  }

  /**
   * Formats an amount with proper decimals
   * @param {BigNumber} amount - The amount to format
   * @param {number} decimals - The number of decimals
   * @returns {string}
   */
  private formatAmount(amount: BigNumber, decimals: number): string {
    return amount.div(BigNumber(10).pow(decimals)).toString();
  }

  /**
   * Calculates the price
   * @param {any} minOutput - The minimum output
   * @param {any} from - The from asset
   * @param {boolean} sell - Whether it's a sell operation
   * @param {number} xDecimals - The decimals of the x asset
   * @param {number} yDecimals - The decimals of the y asset
   * @returns {string}
   */
  private calculatePrice(minOutput: any, from: any, sell: boolean, xDecimals: number, yDecimals: number): string {
    if (sell) {
      return BigNumber(1)
        .div(
          BigNumber(minOutput.amount.toString())
            .div(BigNumber(10).pow(xDecimals))
            .div(BigNumber(from.amount.toString()).div(BigNumber(10).pow(yDecimals)))
        )
        .toString();
    } else {
      return BigNumber(minOutput.amount.toString())
        .div(BigNumber(10).pow(yDecimals))
        .div(BigNumber(from.amount.toString()).div(BigNumber(10).pow(xDecimals)))
        .toString();
    }
  }

  /**
   * Calculates gas-related values
   * @param {number} minTxFee - The minimum transaction fee
   * @returns {number}
   */
  private calculateGas(minTxFee: number): number {
    return BigNumber(minTxFee).div(BigNumber(10).pow(9)).toNumber();
  }

  /**
   * Gets a pool by its ID
   * @param {string} id - The pool ID
   * @returns {Pool} The pool
   */
  public getPool(id: string): Pool {
    return <Pool>this.ammPools.find((ammPool) => ammPool.id === id);
  }

  /**
   * Gets pools by token pair
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @returns {Pool[]} The pools matching the token pair
   */
  public getPoolByToken(baseToken: string, quoteToken: string): Pool[] {
    const realBaseToken = this.storedAssetList.find(
      (asset) => asset.symbol === baseToken,
    );

    const realQuoteToken = this.storedAssetList.find(
      (asset) => asset.symbol === quoteToken,
    );
    if (!realBaseToken || !realQuoteToken)
      throw new Error(`Pool not found for ${baseToken} and ${quoteToken}`);
    return <Pool[]>(
      this.ammPools.filter(
        (ammPool) =>
          (ammPool.x.asset.id === realBaseToken.tokenId &&
            ammPool.y.asset.id === realQuoteToken.tokenId) ||
          (ammPool.x.asset.id === realQuoteToken.tokenId &&
            ammPool.y.asset.id === realBaseToken.tokenId),
      )
    );
  }

  /**
   * Gets a transaction by its ID
   * @param {string} id - The transaction ID
   * @returns {Promise<ErgoTxFull | undefined>} The transaction details
   */
  public async getTx(id: string): Promise<ErgoTxFull | undefined> {
    return await this._node.getTxsById(id);
  }
}

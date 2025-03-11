import LRUCache from 'lru-cache';
import { ApiPromise, Keyring, WsProvider } from '@polkadot/api';
import { getPolkadotConfiguration } from './polkadot.config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
// noinspection ES6PreferShortImport
import { TokenListType, walletPath } from '../../services/base';
import axios from 'axios';
import { Asset } from '@galacticcouncil/sdk';
import { promises as fs } from 'fs';
import { PolkadotController } from './polkadot.controller';
// noinspection ES6PreferShortImport
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import fse from 'fs-extra';
import { BigNumber } from 'bignumber.js';
// noinspection ES6PreferShortImport
import { PollResponse } from '../../network/network.requests';
// noinspection ES6PreferShortImport
import { HydrationTransaction } from '../../connectors/hydration/hydration.types';

const DEFAULT_WS_PROVIDER_URL = 'wss://rpc.hydradx.cloud';
const SUBSCAN_API_URL = 'https://hydration.api.subscan.io/api/scan/extrinsic';

type AssetListTypeAlias = TokenListType;

export class Polkadot {
  private _assetMap: Record<string, Asset> = {};
  private static _instances: LRUCache<string, Polkadot>;
  private readonly _chain: string = 'polkadot';
  private readonly _network: string;
  private polkadotApi: ApiPromise;
  private readonly _keyring: Keyring;
  private readonly _assetListType: AssetListTypeAlias;
  private readonly _assetListSource: string;
  private _ready: boolean = false;
  public gasPrice: number = 0;
  public gasLimit: number = 0;
  public gasCost: string = '';
  public nodeUrl: string;
  public controller: typeof PolkadotController;
  public nativeTokenSymbol: string;

  constructor(
    network: string,
    nodeUrl: string,
    assetListType: AssetListTypeAlias,
    assetListSource: string,
  ) {
    const config = getPolkadotConfiguration(network);
    this._network = network;
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this.nodeUrl = nodeUrl;
    this.polkadotApi = new ApiPromise({ provider: new WsProvider(nodeUrl) });
    this._keyring = new Keyring({ type: 'sr25519' });
    this._assetListType = assetListType;
    this._assetListSource = assetListSource;
    this.controller = PolkadotController;
  }

  public get polkadot(): ApiPromise {
    return this.polkadotApi;
  }

  public get chain(): string {
    return this._chain;
  }

  public get network(): string {
    return this._network;
  }

  // noinspection JSUnusedGlobalSymbols
  public get keyring(): Keyring {
    return this._keyring;
  }

  public get storedAssetList(): Asset[] {
    return Object.values(this._assetMap);
  }

  public ready(): boolean {
    return this._ready;
  }

  public async init(): Promise<void> {
    try {
      const provider = new WsProvider(this.nodeUrl);
      this.polkadotApi = await ApiPromise.create({ provider });
      await this.loadAssets();
      this._ready = true;
    } catch (error) {
      console.error('Failed to initialize Polkadot instance:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    return;
  }

  public static getInstance(network: string): Polkadot {
    const config = getPolkadotConfiguration(network);
    if (!Polkadot._instances) {
      Polkadot._instances = new LRUCache<string, Polkadot>({
        max: config.network.maximumLRUCacheInstances,
      });
    }
    if (!Polkadot._instances.has(config.network.name)) {
      if (network !== null) {
        const nodeUrl = config.network.nodeURL;
        const assetListType = config.network.assetListType as TokenListType;
        const assetListSource = config.network.assetListSource;
        Polkadot._instances.set(
          config.network.name,
          new Polkadot(network, nodeUrl, assetListType, assetListSource),
        );
      } else {
        throw new Error(
          `Polkadot.getInstance received an unexpected network: ${network}.`,
        );
      }
    }
    return Polkadot._instances.get(config.network.name) as Polkadot;
  }

  public static getConnectedInstances(): { [name: string]: Polkadot } {
    const connectedInstances: { [name: string]: Polkadot } = {};
    if (this._instances) {
      for (const key of this._instances.keys()) {
        const instance = this._instances.get(key);
        if (instance) {
          connectedInstances[key] = instance;
        }
      }
    }
    return connectedInstances;
  }

  public async getCurrentBlockNumber(): Promise<number> {
    const header = await this.polkadotApi.rpc.chain.getHeader();
    return header.number.toNumber();
  }

  public getAssetForSymbol(symbol: string): Asset | null {
    return this._assetMap[symbol.toUpperCase()] || null;
  }

  public async getNativeBalance(accountAddress: string): Promise<string> {
    try {
      const wsProvider = new WsProvider(DEFAULT_WS_PROVIDER_URL);
      const api = await ApiPromise.create({ provider: wsProvider });
      const accountInfo = (await api.query.system.account(
        accountAddress,
      )) as any;
      const balance = accountInfo.data.balance || accountInfo.data.free;
      const decimals = this._assetMap['HDX']?.decimals || 12;
      return BigNumber(balance?.toString() ?? '0')
        .div(BigNumber(10).pow(decimals))
        .toFixed(decimals);
    } catch (error) {
      console.error('Error retrieving native balance:', error);
      throw error;
    }
  }

  public async getAssetBalance(
    accountAddress: string,
    tokenSymbol: string,
  ): Promise<string> {
    const token = this._assetMap[tokenSymbol.toUpperCase()];
    if (!token) {
      throw new Error(`Token ${tokenSymbol} not found`);
    }
    try {
      const wsProvider = new WsProvider(DEFAULT_WS_PROVIDER_URL);
      const api = await ApiPromise.create({ provider: wsProvider });
      const assetBalance = (await api.query.tokens.accounts(
        accountAddress,
        token.id,
      )) as any;
      // noinspection UnnecessaryLocalVariableJS
      const freeBalance = new BigNumber(String(assetBalance?.free || 0))
        .div(BigNumber(10).pow(token.decimals))
        .toFixed(token.decimals);
      return freeBalance;
    } catch (error) {
      console.error(
        `Error retrieving balance for token ${tokenSymbol}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Retrieves extrinsic (transaction) information from Subscan.
   *
   * @param txHash - The extrinsic (transaction) hash (e.g. "0x1234abcd...")
   * @returns A promise resolving to the extrinsic information.
   */
  public async getTransaction(txHash: string): Promise<PollResponse> {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      const body = { hash: txHash };
      const response = await axios.post<HydrationTransaction>(
        SUBSCAN_API_URL,
        body,
        { headers },
      );
      const transaction: HydrationTransaction = response.data;

      const transactionStatusMessage = transaction?.message?.toLowerCase();
      let transactionStatus: number;
      if (transactionStatusMessage == 'success') {
        transactionStatus = 1;
      } else if (transactionStatusMessage == 'failed') {
        transactionStatus = -1;
      } else {
        transactionStatus = 0;
      }

      // noinspection UnnecessaryLocalVariableJS
      const result = {
        network: null,
        timestamp: transaction?.generated_at,
        currentBlock: null,
        txHash: txHash,
        txStatus: transactionStatus,
        txBlock: transaction?.data?.block_hash,
        txData: transaction?.data, // TODO if the transaction is too recent, the data is not coming.
        txReceipt: null,
        tokenId: null,
      } as unknown as PollResponse;

      return result;
    } catch (error) {
      console.error('Error fetching transaction:', error);
      throw error;
    }
  }

  public encrypt(mnemonic: string, password: string): string {
    const iv = randomBytes(16);
    const key = Buffer.alloc(32);
    key.write(password);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(mnemonic), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  public decrypt(encryptedMnemonic: string, password: string): string {
    const [iv, encryptedKey] = encryptedMnemonic.split(':');
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

  public async getAccountFromPrivateKey(
    seed: string,
  ): Promise<{ keyPair: any; address: string }> {
    const keyPair = this._keyring.addFromUri(seed);
    return { keyPair, address: keyPair.address };
  }

  public async getAccountFromAddress(address: string) {
    try {
      const path = `${walletPath}/${this._chain}`;
      const encryptedMnemonic: string = await fse.readFile(
        `${path}/${address}.json`,
        'utf8',
      );
      const passphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!passphrase) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error('Missing passphrase');
      }
      const mnemonic = this.decrypt(encryptedMnemonic, passphrase);
      return this._keyring.addFromUri(mnemonic);
    } catch (error) {
      console.error('Error retrieving account from address:', error);
      throw error;
    }
  }

  private async loadAssets(): Promise<void> {
    try {
      const assetData: Asset[] = await this.getAssetData();
      for (const asset of assetData) {
        this._assetMap[asset.symbol.toUpperCase()] = {
          symbol: asset.symbol.toUpperCase(),
          id: asset.id,
          decimals: asset.decimals,
          existentialDeposit: asset.existentialDeposit,
          icon: asset.icon,
          isSufficient: asset.isSufficient,
          name: asset.name,
          type: asset.type,
        };
      }
    } catch (error) {
      console.error('Error loading assets:', error);
      throw error;
    }
  }

  private async getAssetData(): Promise<any> {
    try {
      if (this._assetListType === 'URL') {
        const response = await axios.get(this._assetListSource);
        return response.data.results;
      } else {
        const data = await fs.readFile(this._assetListSource, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.tokens;
      }
    } catch (error) {
      console.error('Error fetching asset data:', error);
      throw error;
    }
  }

  public get storedTokenList() {
    return this._assetMap;
  }
}

import LRUCache from 'lru-cache';
import { Config, getTonConfig } from './ton.config';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonApiClient, Trace } from '@ton-api/client';
import TonWeb from 'tonweb';
import {
  Address,
  address,
  beginCell,
  storeMessage,
  TonClient,
  WalletContractV1R1,
  WalletContractV1R2,
  WalletContractV1R3,
  WalletContractV2R1,
  WalletContractV2R2,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5Beta,
  WalletContractV5R1,
} from '@ton/ton';
import {
  AssetBalanceResponse,
  StonfiWalletAssetResponse,
  TonAsset,
} from './ton.requests';
import fse from 'fs-extra';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { Omniston } from '@ston-fi/omniston-sdk';

import { TonController } from './ton.controller';
import { TokenListType, walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import { StonApiClient } from '@ston-fi/api';
import { Stonfi } from '../../connectors/ston_fi/ston_fi';

type AssetListType = TokenListType;

type WalletUnion =
  | WalletContractV1R1
  | WalletContractV1R2
  | WalletContractV1R3
  | WalletContractV2R1
  | WalletContractV2R2
  | WalletContractV3R1
  | WalletContractV3R2
  | WalletContractV4
  | WalletContractV5R1
  | WalletContractV5Beta;

type WalletUnionType =
  | typeof WalletContractV1R1
  | typeof WalletContractV1R2
  | typeof WalletContractV1R3
  | typeof WalletContractV2R1
  | typeof WalletContractV2R2
  | typeof WalletContractV3R1
  | typeof WalletContractV3R2
  | typeof WalletContractV4
  | typeof WalletContractV5R1
  | typeof WalletContractV5Beta;

export class Ton {
  public nativeTokenSymbol;
  private _assetMap: Record<string, TonAsset> = {};
  private static _instances: LRUCache<string, Ton>;
  private _network: string;
  public tonweb: TonWeb;
  public tonClient: TonClient;
  public omniston: Omniston;
  public stonfiClient: StonApiClient;
  private _chain: string = 'ton';
  private _ready: boolean = false;
  private _assetListType: AssetListType;
  private _assetListSource: string;
  public config: Config;
  public gasPrice: number;
  public gasLimit: number;
  public gasCost: number;
  public workchain: number;
  public nodeUrl: string;
  public controller: typeof TonController;
  public wallet: any;
  public tonApiClient: TonApiClient;

  constructor(
    network: string,
    nodeUrl: string,
    assetListType: AssetListType,
    assetListSource: string,
  ) {
    this.tonApiClient = new TonApiClient();
    this.nodeUrl = nodeUrl;
    this._network = network;
    this.stonfiClient = new StonApiClient();
    this.config = getTonConfig(network);
    this.nativeTokenSymbol = this.config.nativeCurrencySymbol;
    this._assetListType = assetListType;
    this._assetListSource = assetListSource;
    this.omniston = new Omniston({
      apiUrl: this._assetListSource,
    });
    this.gasPrice = this.config.gasPrice;
    this.gasLimit = this.config.gasLimit;
    this.gasCost = this.config.gasCost;
    this.workchain = this.config.workchain;
    this.controller = TonController;
  }

  public get ton(): TonWeb {
    return this.tonweb;
  }

  public get network(): string {
    return this._network;
  }

  public get storedAssetList(): TonAsset[] {
    return Object.values(this._assetMap);
  }

  public ready(): boolean {
    return this._ready;
  }

  public async init(): Promise<void> {
    await this.loadAssets();
    this._ready = true;
    const rpcUrl =
      this.config.rpcType === 'orbs' ? await getHttpEndpoint() : this.nodeUrl;
    if (this.config.apiKey) {
      this.tonweb = new TonWeb(
        new TonWeb.HttpProvider(rpcUrl, { apiKey: this.config.apiKey }),
      );
      this.tonClient = new TonClient({
        endpoint: rpcUrl,
        apiKey: this.config.apiKey,
      });
    } else {
      this.tonweb = new TonWeb(new TonWeb.HttpProvider(rpcUrl));
      this.tonClient = new TonClient({ endpoint: rpcUrl });
    }
  }

  async close() {
    return;
  }

  public static getInstance(network: string): Ton {
    const config = getTonConfig(network);
    if (Ton._instances === undefined) {
      Ton._instances = new LRUCache<string, Ton>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Ton._instances.has(config.network.name)) {
      if (network !== null) {
        const nodeUrl = config.network.nodeURL;
        const assetListType = config.network.assetListType as TokenListType;
        const assetListSource = config.network.assetListSource;

        Ton._instances.set(
          config.network.name,
          new Ton(network, nodeUrl, assetListType, assetListSource),
        );
      } else {
        throw new Error(
          `Ton.getInstance received an unexpected network: ${network}.`,
        );
      }
    }

    return Ton._instances.get(config.network.name) as Ton;
  }

  public static getConnectedInstances(): { [name: string]: Ton } {
    const connectedInstances: { [name: string]: Ton } = {};
    if (this._instances !== undefined) {
      const keys = Array.from(this._instances.keys());
      for (const instance of keys) {
        if (instance !== undefined) {
          connectedInstances[instance] = this._instances.get(instance) as Ton;
        }
      }
    }
    return connectedInstances;
  }

  async getCurrentBlockNumber() {
    const status = await this.tonweb.provider.getMasterchainInfo();
    //const initialBlock = status.init;
    const lastBlock = status.last;
    return {
      seqno: lastBlock.seqno,
      root_hash: lastBlock.root_hash,
    };
  }

  async getTransaction(eventHash: string): Promise<Trace> {
    if (eventHash.includes('hb-ton-stonfi-')) {
      const queryId = eventHash.replace('hb-ton-stonfi-', '');
      const decodedString = Buffer.from(queryId, 'base64url').toString('utf-8');
      const obj = JSON.parse(decodedString);
      obj.queryId = String(obj.queryId);
      const stonfi = Stonfi.getInstance(this._network);

      const { txHash } = await stonfi.waitForConfirmation(
        obj.walletAddress,
        obj.queryId,
      );

      eventHash = txHash;
    }

    return await this.tonApiClient.traces.getTrace(eventHash);
  }

  public async getAccountFromPrivateKey(
    mnemonic: string,
  ): Promise<{ publicKey: string; secretKey: string }> {
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
    this.wallet = await this.getWallet(
      keyPair.publicKey.toString('base64url'),
      this.workchain,
      this.config.walletVersion,
    );
    const contract = this.tonClient.open(this.wallet);
    const address = contract.address.toStringBuffer({
      bounceable: false,
      testOnly: this.config.network.name === 'testnet' ? true : false,
    });
    const publicKey = address.toString('base64url');
    const secretKey = keyPair.secretKey.toString('base64url');
    return { publicKey, secretKey };
  }

  async getAccountFromAddress(
    address: string,
  ): Promise<{ publicKey: string; secretKey: string }> {
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
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
    this.wallet = await this.getWallet(
      keyPair.publicKey.toString('base64url'),
      this.workchain,
      this.config.walletVersion,
    );
    const contract = this.tonClient.open(this.wallet);
    const publicKey = contract.address.toStringBuffer({
      bounceable: false,
      testOnly: this.config.network.name === 'testnet' ? true : false,
    });
    return {
      publicKey: publicKey.toString('base64url'),
      secretKey: keyPair.secretKey.toString('base64url'),
    };
  }

  public encrypt(mnemonic: string, password: string): string {
    const iv = randomBytes(16);
    const key = Buffer.alloc(32);
    key.write(password);

    // @ts-ignore
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    // @ts-ignore
    const encrypted = Buffer.concat([cipher.update(mnemonic), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  public decrypt(encryptedMnemonic: string, password: string): string {
    const [iv, encryptedKey] = encryptedMnemonic.split(':');
    const key = Buffer.alloc(32);
    key.write(password);
    // @ts-ignore
    const decipher = createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(iv, 'hex'),
    );

    const decrpyted = Buffer.concat([
      // @ts-ignore
      decipher.update(Buffer.from(encryptedKey, 'hex')),
      // @ts-ignore
      decipher.final(),
    ]);

    return decrpyted.toString();
  }

  //   interface AssetBalanceResponse {
  //   [symbol: string]: string; // Cada símbolo de token mapeia para seu saldo
  // }

  public async getAssetBalance(
    account: string,
    tokens: string[],
  ): Promise<AssetBalanceResponse> {
    const balances: AssetBalanceResponse = {};

    try {
      const response = await this.stonfiClient.getWalletAssets(account);

      tokens.forEach((token) => {
        const assetInfo = response.find(
          (asset: StonfiWalletAssetResponse) => asset.symbol === token,
        );

        if (assetInfo && assetInfo.balance !== undefined) {
          const balanceParsed =
            Number(assetInfo.balance) / 10 ** assetInfo.decimals;
          balances[token] = balanceParsed.toString();
        } else {
          balances[token] = '0';
        }
      });
    } catch (error: any) {
      if (!error.message.includes('account asset info not found')) {
        throw error;
      }
    }

    return balances;
  }

  public async getNativeBalance(account: string): Promise<string> {
    const tonAsset = await this.tonClient.getBalance(address(account));
    return tonAsset.toString();
  }

  public getAssetForSymbol(symbol: string): TonAsset | null {
    return this._assetMap[symbol] ? this._assetMap[symbol] : null;
  }

  // TODO is it necessary?!!!
  public async optIn(address: string, symbol: string) {
    const account = await this.getAccountFromAddress(address);
    const block = await this.getCurrentBlockNumber();
    const asset = this._assetMap[symbol];

    return { ...account, block, asset };
  }

  private async loadAssets(): Promise<void> {
    const assetData = await this.getAssetData();
    for (const result of assetData) {
      this._assetMap[result.symbol] = {
        symbol: result.symbol,
        assetId: result.address,
        decimals: result.decimals,
      };
    }
  }

  private async getAssetData(): Promise<any> {
    let assetData;
    if (this._assetListType === 'URL') {
      const assets = await this.omniston.assetList();
      assetData = assets.assets;
    } else {
      const data = JSON.parse(await fs.readFile(this._assetListSource, 'utf8'));
      assetData = data.tokens;
    }
    return assetData;
  }

  public get storedTokenList() {
    return this._assetMap;
  }

  public async waitForTransactionByMessage(
    address: Address,
    messageBase64: string,
    timeout: number = 30000,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          // Check for timeout
          if (Date.now() - startTime > timeout) {
            clearInterval(interval);
            resolve(null);
            return;
          }

          const state = await this.tonClient.getContractState(address);
          if (!state || !state.lastTransaction) {
            return;
          }

          const transactions = await this.tonClient.getTransactions(address, {
            limit: 1,
            lt: state.lastTransaction.lt,
            hash: state.lastTransaction.hash,
          });

          if (transactions.length > 0) {
            const tx = transactions[0];
            if (tx.inMessage) {
              const msgCell = beginCell()
                .store(storeMessage(tx.inMessage))
                .endCell();
              const inMsgHash = msgCell.hash().toString('base64');

              if (inMsgHash === messageBase64) {
                clearInterval(interval);
                resolve(tx.hash().toString('base64'));
                return;
              }
            }
          }
        } catch (error) {
          logger.error(`Error while waiting for transaction: ${error}`);
        }
      }, 1000);
    });
  }

  public getWalletContractClassByVersion(
    version: string,
  ): WalletUnionType | undefined {
    if (!version) {
      return undefined;
    } else if (version === 'v1r1') {
      return WalletContractV1R1;
    } else if (version === 'v1r2') {
      return WalletContractV1R2;
    } else if (version === 'v1r3') {
      return WalletContractV1R3;
    } else if (version === 'v2r1') {
      return WalletContractV2R1;
    } else if (version === 'v2r2') {
      return WalletContractV2R2;
    } else if (version === 'v3r1') {
      return WalletContractV3R1;
    } else if (version === 'v3r2') {
      return WalletContractV3R2;
    } else if (version === 'v4') {
      return WalletContractV4;
    } else if (version === 'v5R1') {
      return WalletContractV5R1;
    } else if (version === 'v5Beta') {
      return WalletContractV5Beta;
    } else {
      throw new Error(`Unknown wallet version: ${version}`);
    }
  }

  public async getBestWallet(
    publicKey: Buffer,
    workchain: number,
  ): Promise<WalletUnion> {
    const walletVersions = this.config.availableWalletVersions;
    let maxNativeTokenBalance = 0;
    let bestWallet = null;
    for (const walletVersion of walletVersions) {
      const walletContractClass =
        this.getWalletContractClassByVersion(walletVersion);
      const wallet = walletContractClass.create({
        workchain: workchain,
        publicKey: publicKey,
      });
      const contract = this.tonClient.open(wallet);
      const rawNativeTokenBalance = await this.tonClient.getBalance(
        contract.address,
      );
      const nativeTokenBalance = Number(rawNativeTokenBalance);
      if (nativeTokenBalance > maxNativeTokenBalance) {
        maxNativeTokenBalance = nativeTokenBalance;
        bestWallet = wallet;
      }
    }
    return bestWallet;
  }

  public async getWallet(
    publicKey: string,
    workchain?: number,
    version?: string,
  ): Promise<WalletUnion | undefined> {
    if (!workchain) {
      workchain = this.config.workchain;
    }

    let walletContractClass;
    if (version) {
      walletContractClass = this.getWalletContractClassByVersion(version);
    }

    const publicKeyBuffer = Buffer.from(publicKey, 'base64url');

    if (walletContractClass) {
      return walletContractClass.create({
        workchain: workchain,
        publicKey: publicKeyBuffer,
      });
    } else {
      return await this.getBestWallet(publicKeyBuffer, workchain);
    }
  }


}

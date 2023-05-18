import LRUCache from 'lru-cache';
import { getAlgorandConfig } from './algorand.config';
import {
  Algodv2,
  Indexer,
  mnemonicToSecretKey,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  Account,
} from 'algosdk';
import { AlgorandAsset, PollResponse } from './algorand.requests';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { TokenListType, walletPath } from '../../services/base';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import axios from 'axios';
import { promises as fs } from 'fs';

type AssetListType = TokenListType;

export class Algorand {
  public nativeTokenSymbol;
  private _assetMap: Record<string, AlgorandAsset> = {};
  private static _instances: LRUCache<string, Algorand>;
  private _chain: string = 'algorand';
  private _network: string;
  private _algod: Algodv2;
  private _indexer: Indexer;
  private _ready: boolean = false;
  private _assetListType: AssetListType;
  private _assetListSource: string;
  public gasPrice: number;
  public gasLimit: number;
  public gasCost: number;

  constructor(
    network: string,
    nodeUrl: string,
    indexerUrl: string,
    assetListType: AssetListType,
    assetListSource: string
  ) {
    this._network = network;
    const config = getAlgorandConfig(network);
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this._algod = new Algodv2('', nodeUrl);
    this._indexer = new Indexer('', indexerUrl, 'undefined');
    this._assetListType = assetListType;
    this._assetListSource = assetListSource;
    this.gasPrice = 0;
    this.gasLimit = 0;
    this.gasCost = 0.001;
  }

  public get algod(): Algodv2 {
    return this._algod;
  }

  public get indexer(): Indexer {
    return this._indexer;
  }

  public get network(): string {
    return this._network;
  }

  public get storedAssetList(): AlgorandAsset[] {
    return Object.values(this._assetMap);
  }

  public ready(): boolean {
    return this._ready;
  }

  public async init(): Promise<void> {
    await this.loadAssets();
    this._ready = true;
    return;
  }

  async close() {
    return;
  }

  public static getInstance(network: string): Algorand {
    const config = getAlgorandConfig(network);
    if (Algorand._instances === undefined) {
      Algorand._instances = new LRUCache<string, Algorand>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Algorand._instances.has(config.network.name)) {
      if (network !== null) {
        const nodeUrl = config.network.nodeURL;
        const indexerUrl = config.network.indexerURL;
        const assetListType = config.network.assetListType as TokenListType;
        const assetListSource = config.network.assetListSource;
        Algorand._instances.set(
          config.network.name,
          new Algorand(
            network,
            nodeUrl,
            indexerUrl,
            assetListType,
            assetListSource
          )
        );
      } else {
        throw new Error(
          `Algorand.getInstance received an unexpected network: ${network}.`
        );
      }
    }

    return Algorand._instances.get(config.network.name) as Algorand;
  }

  public static getConnectedInstances(): { [name: string]: Algorand } {
    const connectedInstances: { [name: string]: Algorand } = {};
    if (this._instances !== undefined) {
      const keys = Array.from(this._instances.keys());
      for (const instance of keys) {
        if (instance !== undefined) {
          connectedInstances[instance] = this._instances.get(
            instance
          ) as Algorand;
        }
      }
    }
    return connectedInstances;
  }

  async getCurrentBlockNumber(): Promise<number> {
    const status = await this._algod.status().do();
    return status['next-version-round'];
  }

  public async getTransaction(txHash: string): Promise<PollResponse> {
    const transactionId = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
    let currentBlock;
    let transactionData;
    let transactionBlock;
    let fee;
    try {
      transactionData = await this._algod
        .pendingTransactionInformation(transactionId)
        .do();
      transactionBlock = transactionData['confirmed-round']; // will be undefined if not confirmed
      transactionBlock = transactionBlock ? transactionBlock : null;
      fee = transactionData.txn.fee;
      currentBlock = await this.getCurrentBlockNumber();
    } catch (error: any) {
      if (error.status != 404) {
        throw error;
      }
      transactionData = await this._indexer
        .lookupTransactionByID(transactionId)
        .do();
      currentBlock = transactionData['current-round'];
      transactionBlock = transactionData.transaction['confirmed-round'];
      fee = transactionData.transaction.fee;
    }
    return {
      currentBlock,
      txBlock: transactionBlock,
      txHash: '0x' + transactionId,
      fee,
    };
  }

  public getAccountFromPrivateKey(mnemonic: string): Account {
    return mnemonicToSecretKey(mnemonic);
  }
  async getAccountFromAddress(address: string): Promise<Account> {
    const path = `${walletPath}/${this._chain}`;
    const encryptedMnemonic: string = await fse.readFile(
      `${path}/${address}.json`,
      'utf8'
    );
    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }
    const mnemonic = this.decrypt(encryptedMnemonic, passphrase);

    return mnemonicToSecretKey(mnemonic);
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
      Buffer.from(iv, 'hex')
    );

    const decrpyted = Buffer.concat([
      decipher.update(Buffer.from(encryptedKey, 'hex')),
      decipher.final(),
    ]);

    return decrpyted.toString();
  }

  public async getAssetBalance(
    account: Account,
    assetName: string
  ): Promise<string> {
    const algorandAsset = this._assetMap[assetName];
    let balance;

    try {
      const response = await this._algod
        .accountAssetInformation(account.addr, algorandAsset.assetId)
        .do();
      balance = response['asset-holding'].amount;
    } catch (error: any) {
      if (!error.message.includes('account asset info not found')) {
        throw error;
      }
      balance = 0;
    }

    const amount = balance * parseFloat(`1e-${algorandAsset.decimals}`);
    return amount.toString();
  }

  public async getNativeBalance(account: Account): Promise<string> {
    const accountInfo = await this._algod.accountInformation(account.addr).do();
    const algoAsset = this._assetMap[this.nativeTokenSymbol];
    return (
      accountInfo.amount * parseFloat(`1e-${algoAsset.decimals}`)
    ).toString();
  }

  public getAssetForSymbol(symbol: string): AlgorandAsset | null {
    return this._assetMap[symbol] ? this._assetMap[symbol] : null;
  }

  public async optIn(address: string, symbol: string) {
    const account = await this.getAccountFromAddress(address);
    const assetIndex = this._assetMap[symbol].assetId;
    const suggestedParams = await this._algod.getTransactionParams().do();
    const optInTxn = makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: account.addr,
      to: address,
      suggestedParams,
      assetIndex,
      amount: 0,
    });
    const signedOptInTxn = optInTxn.signTxn(account.sk);
    const resp = await this._algod.sendRawTransaction(signedOptInTxn).do();
    return resp;
  }

  private async loadAssets(): Promise<void> {
    const assetData = await this.getAssetData();
    for (const result of assetData) {
      this._assetMap[result.unit_name.toUpperCase()] = {
        symbol: result.unit_name.toUpperCase(),
        assetId: +result.id,
        decimals: result.decimals,
      };
    }
  }

  private async getAssetData(): Promise<any> {
    let assetData;
    if (this._assetListType === 'URL') {
      const response = await axios.get(this._assetListSource);
      assetData = response.data.results;
    } else {
      const data = JSON.parse(await fs.readFile(this._assetListSource, 'utf8'));
      assetData = data.results;
    }
    return assetData;
  }
}

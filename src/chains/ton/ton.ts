import LRUCache from 'lru-cache';
import { getTonConfig } from './ton.config';
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonApiClient } from '@ton-api/client';
import { Address } from '@ton/core';
import { TonAsset } from './ton.requests';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { StonApiClient } from '@ston-fi/api';

// import { walletPath } from '../../services/base';
// import fse from 'fs-extra';
// import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { TonController } from './ton.controller';
import { WalletContractV4 } from '@ton/ton';

export class Ton {
  public nativeTokenSymbol;
  private _assetMap: Record<string, TonAsset> = {};
  private static _instances: LRUCache<string, Ton>;
  //private _chain: string = 'ton';
  private _network: string;
  private _ton: TonApiClient;
  //private _indexer: Indexer;
  private _ready: boolean = false;
  //private _assetListType: AssetListType;
  //private _assetListSource: string;
  public gasPrice: number;
  public gasLimit: number;
  public gasCost: number;
  public controller: typeof TonController;

  constructor(
    network: string,
    nodeUrl: string,
    // indexerUrl: string,
    // assetListType: AssetListType,
    // assetListSource: string
  ) {
    this._network = network;
    const config = getTonConfig(network);
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this._ton = new TonApiClient({ baseUrl: nodeUrl });
    this.wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
  });

    // this._indexer = new Indexer('', indexerUrl, 'undefined');
    // this._assetListType = assetListType;
    // this._assetListSource = assetListSource;
    this.gasPrice = 0;
    this.gasLimit = 0;
    this.gasCost = 0.001;
    this.controller = TonController;
  }

  public get ton(): TonApiClient {
    return this._ton;
  }

  // public get indexer(): Indexer {
  //   return this._indexer;
  // }

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
    return;
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
        // const indexerUrl = config.network.indexerURL;
        // const assetListType = config.network.assetListType as TokenListType;
        // const assetListSource = config.network.assetListSource;
        Ton._instances.set(
          config.network.name,
          new Ton(
            network,
            nodeUrl,
            // indexerUrl,
            // assetListType,
            // assetListSource
          )
        );
      } else {
        throw new Error(
          `Ton.getInstance received an unexpected network: ${network}.`
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
          connectedInstances[instance] = this._instances.get(
            instance
          ) as Ton;
        }
      }
    }
    return connectedInstances;
  }

  // async getCurrentBlockNumber(address: string): Promise<number> {
  //   const status = await this._ton.getContractState(address);
  //   return status['next-version-round'];
  // }

  // public async getTransaction(txHash: string): Promise<PollResponse> {
  //   const transactionId = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
  //   let currentBlock;
  //   let transactionData;
  //   let transactionBlock;
  //   let fee;
  //   try {
  //     transactionData = await this._ton
  //       .pendingTransactionInformation(transactionId)
  //       .do();
  //     transactionBlock = transactionData['confirmed-round']; // will be undefined if not confirmed
  //     transactionBlock = transactionBlock ? transactionBlock : null;
  //     fee = transactionData.txn.fee;
  //     currentBlock = await this.getCurrentBlockNumber();
  //   } catch (error: any) {
  //     if (error.status != 404) {
  //       throw error;
  //     }
  //     transactionData = await this._indexer
  //       .lookupTransactionByID(transactionId)
  //       .do();
  //     currentBlock = transactionData['current-round'];
  //     transactionBlock = transactionData.transaction['confirmed-round'];
  //     fee = transactionData.transaction.fee;
  //   }
  //   return {
  //     currentBlock,
  //     txBlock: transactionBlock,
  //     txHash: '0x' + transactionId,
  //     fee,
  //   };
  // }

  public async getAccountFromPrivateKey(mnemonic: string) {
    const mnemonics = Array.from(
      { length: 24 },
      (_, i) => `${mnemonic} ${i + 1}`
    );
    const { publicKey } = await mnemonicToPrivateKey(mnemonics);
    return publicKey.toString("utf8");
  }


  // async getAccountFromAddress(address: string): Promise<Account> {
  //   const path = `${walletPath}/${this._chain}`;
  //   const encryptedMnemonic: string = await fse.readFile(
  //     `${path}/${address}.json`,
  //     'utf8'
  //   );
  //   const passphrase = ConfigManagerCertPassphrase.readPassphrase();
  //   if (!passphrase) {
  //     throw new Error('missing passphrase');
  //   }
  //   const mnemonic = this.decrypt(encryptedMnemonic, passphrase);

  //   return mnemonicToSecretKey(mnemonic);
  // }

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
    account: Address,
    assetName: string
  ): Promise<string> {
    const tonAsset = this._assetMap[assetName];
    let balance;

    try {
      const wallet = WalletContractV4.create({
        workchain,
        publicKey: keyPair.publicKey,
    });


      const response = await this._ton.getBalance(account);
      balance = Number(response);
    } catch (error: any) {
      if (!error.message.includes('account asset info not found')) {
        throw error;
      }
      balance = 0;
    }

    const amount = balance * parseFloat(`1e-${tonAsset.decimals}`);
    return amount.toString();
  }

  // public async getNativeBalance(account: Account): Promise<string> {
  //   const accountInfo = await this._ton.accountInformation(account.addr).do();
  //   const algoAsset = this._assetMap[this.nativeTokenSymbol];
  //   return (
  //     accountInfo.amount * parseFloat(`1e-${algoAsset.decimals}`)
  //   ).toString();
  // }

  public getAssetForSymbol(symbol: string): TonAsset | null {
    return this._assetMap[symbol] ? this._assetMap[symbol] : null;
  }

  // public async optIn(address: string, symbol: string) {
  //   const account = await this.getAccountFromAddress(address);
  //   const assetIndex = this._assetMap[symbol].assetId;
  //   const suggestedParams = await this._ton.getTransactionParams().do();
  //   const optInTxn = makeAssetTransferTxnWithSuggestedParamsFromObject({
  //     from: account.addr,
  //     to: address,
  //     suggestedParams,
  //     assetIndex,
  //     amount: 0,
  //   });
  //   const signedOptInTxn = optInTxn.signTxn(account.sk);
  //   const resp = await this._ton.sendRawTransaction(signedOptInTxn).do();
  //   return resp;
  // }

  private async loadAssets(): Promise<void> {
    const assetData = await this.getAssetData();
    for (const result of assetData) {
      this._assetMap[result.symbol] = {
        symbol: result.symbol,
        assetId: result.contractAddress,
        decimals: result.decimals,
      };
    }
  }

  private async getAssetData(): Promise<any> {
    const client = new StonApiClient();
    const assets = await client.getAssets();
    return assets
  }

  public get storedTokenList() {
    return this._assetMap;
  }
}

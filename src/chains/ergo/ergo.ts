import {NetworkPrefix} from "ergo-lib-wasm-nodejs"
import LRUCache from 'lru-cache';
import {ErgoController} from "./ergo.controller";
import {NodeService} from "./node.service";
import { TokenListType } from '../../services/base';
import {getErgoConfig} from "./ergo.config";
import {DexService} from "./dex.service";
import {ErgoAsset} from "./ergo.interface";

type AssetListType = TokenListType;
export class Ergo {
  private _assetMap: Record<string, ErgoAsset> = {};
  private static _instances: LRUCache<string, Ergo>;
  private _chain: string = 'ergo';
  private _network: string;
  private _networkPrefix: NetworkPrefix;
  private _node: NodeService;
  private _dex: DexService;
  private _assetListType: AssetListType;
  private _assetListSource: string;
  private _ready: boolean = false;
  public txFee: number;
  public controller: typeof ErgoController;

  constructor (
    network: string,
    nodeUrl: string
  ) {
    this._network = network
    const config = getErgoConfig(network);
    if (network === "Mainnet")
      this._networkPrefix = NetworkPrefix.Mainnet
    else
      this._networkPrefix = NetworkPrefix.Testnet
    this._node = new NodeService(nodeUrl, config.network.timeOut)
    this._dex = new DexService(nodeUrl, config.network.timeOut)
    this.controller = ErgoController;
    this.txFee = config.network.minTxFee;
    this._assetListType = "URL"
  }
  public get node(): NodeService {
    return this._node;
  }

  public get network(): string {
    return this._network;
  }

  public get storedAssetList(): ErgoAsset[] {
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

  public static getInstance(network: string): Ergo {
    const config = getErgoConfig(network);
    if (Ergo._instances === undefined) {
      Ergo._instances = new LRUCache<string, Ergo>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Ergo._instances.has(config.network.name)) {
      if (network !== null) {
        const nodeUrl = config.network.nodeURL;
        Ergo._instances.set(
          config.network.name,
          new Ergo(
            network,
            nodeUrl
          )
        );
      } else {
        throw new Error(
          `Ergo.getInstance received an unexpected network: ${network}.`
        );
      }
    }

    return Ergo._instances.get(config.network.name) as Ergo;
  }

  public static getConnectedInstances(): { [name: string]: Ergo } {
    const connectedInstances: { [name: string]: Ergo } = {};
    if (this._instances !== undefined) {
      const keys = Array.from(this._instances.keys());
      for (const instance of keys) {
        if (instance !== undefined) {
          connectedInstances[instance] = this._instances.get(
            instance
          ) as Ergo;
        }
      }
    }
    return connectedInstances;
  }

  async getCurrentBlockNumber(): Promise<number> {
    const status = await this._node.getNetworkHeight()
    return status + 1;
  }

  // public async getTransaction(txHash: string): Promise<PollResponse> {
  //   const transactionId = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
  //   let currentBlock;
  //   let transactionData;
  //   let transactionBlock;
  //   let fee;
  //   try {
  //     transactionData = await this._algod
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
  //
  // public getAccountFromPrivateKey(mnemonic: string): Account {
  //   return mnemonicToSecretKey(mnemonic);
  // }
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
  //
  //   return mnemonicToSecretKey(mnemonic);
  // }
  //
  // public encrypt(mnemonic: string, password: string): string {
  //   const iv = randomBytes(16);
  //   const key = Buffer.alloc(32);
  //   key.write(password);
  //
  //   const cipher = createCipheriv('aes-256-cbc', key, iv);
  //
  //   const encrypted = Buffer.concat([cipher.update(mnemonic), cipher.final()]);
  //
  //   return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  // }
  //
  // public decrypt(encryptedMnemonic: string, password: string): string {
  //   const [iv, encryptedKey] = encryptedMnemonic.split(':');
  //   const key = Buffer.alloc(32);
  //   key.write(password);
  //
  //   const decipher = createDecipheriv(
  //     'aes-256-cbc',
  //     key,
  //     Buffer.from(iv, 'hex')
  //   );
  //
  //   const decrpyted = Buffer.concat([
  //     decipher.update(Buffer.from(encryptedKey, 'hex')),
  //     decipher.final(),
  //   ]);
  //
  //   return decrpyted.toString();
  // }
  //
  // public async getAssetBalance(
  //   account: Account,
  //   assetName: string
  // ): Promise<string> {
  //   const algorandAsset = this._assetMap[assetName];
  //   let balance;
  //
  //   try {
  //     const response = await this._algod
  //       .accountAssetInformation(account.addr, algorandAsset.assetId)
  //       .do();
  //     balance = response['asset-holding'].amount;
  //   } catch (error: any) {
  //     if (!error.message.includes('account asset info not found')) {
  //       throw error;
  //     }
  //     balance = 0;
  //   }
  //
  //   const amount = balance * parseFloat(`1e-${algorandAsset.decimals}`);
  //   return amount.toString();
  // }
  //
  // public async getNativeBalance(account: Account): Promise<string> {
  //   const accountInfo = await this._algod.accountInformation(account.addr).do();
  //   const algoAsset = this._assetMap[this.nativeTokenSymbol];
  //   return (
  //     accountInfo.amount * parseFloat(`1e-${algoAsset.decimals}`)
  //   ).toString();
  // }
  //
  // public getAssetForSymbol(symbol: string): AlgorandAsset | null {
  //   return this._assetMap[symbol] ? this._assetMap[symbol] : null;
  // }
  //
  // public async optIn(address: string, symbol: string) {
  //   const account = await this.getAccountFromAddress(address);
  //   const assetIndex = this._assetMap[symbol].assetId;
  //   const suggestedParams = await this._algod.getTransactionParams().do();
  //   const optInTxn = makeAssetTransferTxnWithSuggestedParamsFromObject({
  //     from: account.addr,
  //     to: address,
  //     suggestedParams,
  //     assetIndex,
  //     amount: 0,
  //   });
  //   const signedOptInTxn = optInTxn.signTxn(account.sk);
  //   const resp = await this._algod.sendRawTransaction(signedOptInTxn).do();
  //   return resp;
  // }
  //
  private async loadAssets(): Promise<void> {
    const assetData = await this.getAssetData();
    for (const result of assetData.tokens) {
      this._assetMap[result.name.toUpperCase()] = {
        tokenId: result.address,
        decimals: result.decimals,
        name: result.name,
        symbol: result.ticker
      };
    }
  }

  private async getAssetData(): Promise<any> {
    return await this._dex.getTokens();
  }

  public get storedTokenList() {
    return this._assetMap;
  }
}
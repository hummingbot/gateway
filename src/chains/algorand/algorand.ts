import LRUCache from 'lru-cache';
import { getAlgorandConfig } from './algorand.config';
import { Algodv2, Indexer } from 'algosdk';
import { Token } from '../cosmos/cosmos-base';
import { PollResponse } from './algorand.requests';

export class Algorand {
  public nativeTokenSymbol;
  protected tokenList: Token[] = [];
  private static _instances: LRUCache<string, Algorand>;
  private _network: string;
  private _algod: Algodv2;
  private _indexer: Indexer;
  private _ready: boolean = false;

  constructor(network: string, nodeUrl: string, indexerUrl: string) {
    this._network = network;
    const config = getAlgorandConfig(network);
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this._algod = new Algodv2('', nodeUrl);
    this._indexer = new Indexer('', indexerUrl, 'undefined');
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

  public ready(): boolean {
    return this._ready;
  }

  public async init(): Promise<void> {
    // todo: common EVM-like interface
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
        Algorand._instances.set(
          config.network.name,
          new Algorand(network, nodeUrl, indexerUrl)
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
    // todo: common EVM-like interface
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
}

import LRUCache from 'lru-cache';
import { getTonConfig } from './ton.config';
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import TonWeb from "tonweb";
import { OpenedContract, TonClient, WalletContractV4, Address, beginCell, storeMessage } from "@ton/ton";
import { DEX, pTON } from "@ston-fi/sdk";
import { PollResponse, TonAsset } from './ton.requests';
import fse from 'fs-extra';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { Omniston } from "@ston-fi/omniston-sdk";
import { TonController } from './ton.controller';
import { TokenListType, walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { RouterV2_1 } from '@ston-fi/sdk/dist/contracts/dex/v2_1/router/RouterV2_1';
import { PtonV2_1 } from '@ston-fi/sdk/dist/contracts/pTON/v2_1/PtonV2_1';
import { logger } from '../../services/logger';


type AssetListType = TokenListType;

export class Ton {
  public nativeTokenSymbol;
  private _assetMap: Record<string, TonAsset> = {};
  private static _instances: LRUCache<string, Ton>;
  private _network: string;
  public tonweb: TonWeb;
  public tonClient: TonClient;
  public tonClientRouter: OpenedContract<RouterV2_1>;
  public tonClientproxyTon: PtonV2_1;
  public omniston: Omniston;
  private _chain: string = 'ton';
  private _ready: boolean = false;
  private _assetListType: AssetListType;
  private _assetListSource: string;
  public gasPrice: number;
  public gasLimit: number;
  public gasCost: number;
  public workchain: number;
  public controller: typeof TonController;

  constructor(
    network: string,
    nodeUrl: string,
    assetListType: AssetListType,
    assetListSource: string
  ) {
    this._network = network;
    const config = getTonConfig(network);
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this.tonweb = new TonWeb(new TonWeb.HttpProvider(nodeUrl));
    this.tonClient = new TonClient({ endpoint: nodeUrl });
    this.tonClientRouter = this.tonClient.open(
      DEX.v2_1.Router.create(
        "kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v"
      )
    );
    this.tonClientproxyTon = pTON.v2_1.create(
      "kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px" // pTON v2.1.0
    );
    this._assetListType = assetListType;
    this._assetListSource = assetListSource;
    this.omniston = new Omniston({
      apiUrl: this._assetListSource,
    });
    this.gasPrice = 0;
    this.gasLimit = 0;
    this.gasCost = 0.001;
    this.workchain = 0;
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
        const assetListType = config.network.assetListType as TokenListType;
        const assetListSource = config.network.assetListSource;

        Ton._instances.set(
          config.network.name,
          new Ton(
            network,
            nodeUrl,
            assetListType,
            assetListSource
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


  async getCurrentBlockNumber() {
    const status = await this.tonweb.provider.getMasterchainInfo();
    //const initialBlock = status.init;
    const lastBlock = status.last;
    return {
      seqno: lastBlock.seqno,
      root_hash: lastBlock.root_hash
    };
  }

  public async getTransaction(address: string, txHash: string): Promise<PollResponse> {
    const transactionId = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
    const { seqno, root_hash } = await this.getCurrentBlockNumber()
    let transactionData;
    try {
      transactionData = await this.tonweb.getTransactions(address, 1, 0, transactionId)
    } catch (error: any) {
      if (error.status != 404) {
        throw error;
      }
    }
    return {
      currentBlock: seqno,
      txBlock: root_hash,
      txHash: '0x' + transactionData.transaction_id.hash,
      fee: transactionData.fee,
    };
  }

  public async getAccountFromPrivateKey(mnemonic: string) {
    const mnemonics = Array.from(
      { length: 24 },
      (_, i) => `${mnemonic} ${i + 1}`
    );
    const { publicKey } = await mnemonicToPrivateKey(mnemonics);
    return publicKey.toString("utf8");
  }


  async getAccount(address: string) {
    let mnemonics = await mnemonicNew(64, address);
    let keyPair = await mnemonicToPrivateKey(mnemonics);
    let workchain = 0; // Usually you need a workchain 0
    let wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    const contract = this.tonClient.open(wallet);
    return contract
  }

  async getAccountFromAddress(address: string) {
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

    const mnemonics = Array.from(
      { length: 24 },
      (_, i) => `${mnemonic} ${i + 1}`
    );

    const keys = await mnemonicToPrivateKey(mnemonics);

    return {
      publicKey: keys.publicKey.toString("utf8"),
      secretKey: keys.secretKey.toString("utf8")
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
      Buffer.from(iv, 'hex')
    );

    const decrpyted = Buffer.concat([
      decipher.update(Buffer.from(encryptedKey, 'hex')),
      decipher.final(),
    ]);

    return decrpyted.toString();
  }

  public async getAssetBalance(
    account: string,
    assetName: string
  ): Promise<string> {
    const tonAsset = this._assetMap[assetName];
    let balance;
    try {
      const response = await this.tonweb.getBalance(account);
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

  public async getNativeBalance(account: string): Promise<string> {
    const tonAsset = await this.tonweb.getBalance(account);
    return tonAsset.toString();
  }

  public getAssetForSymbol(symbol: string): TonAsset | null {
    return this._assetMap[symbol] ? this._assetMap[symbol] : null;
  }

  // here isnt necessary for ton chain
  public async optIn(address: string, symbol: string) {
    const account = await this.getAccountFromAddress(address);
    const block = await this.getCurrentBlockNumber()
    const asset = this._assetMap[symbol];

    // const wallet = this.ton.wallet.create({ publicKey: account.publicKey });

    // const result = await wallet.methods.transfer({
    //   secretKey: account.secretKey,
    //   toAddress: "EQDjVXa_oltdBP64Nc__p397xLCvGm2IcZ1ba7anSW0NAkeP",
    //   amount: toNanoNano(0.01),
    //   seqno: block.seqno,
    // }).estimateFee()

    return { ...account, block, asset };
  }

  private async loadAssets(): Promise<void> {
    const assetData = await this.getAssetData();
    for (const result of assetData) {
      this._assetMap[result.symbol] = {
        symbol: result.symbol,
        assetId: result.address.address,
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
      assetData = data.results;
    }
    return assetData;
  }

  public get storedTokenList() {
    return this._assetMap;
  }

  public async waitForTransactionByMessage(address: Address, messageBase64: string, timeout: number = 30000): Promise<string | null> {
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
            hash: state.lastTransaction.hash
          });

          if (transactions.length > 0) {
            const tx = transactions[0];
            if (tx.inMessage) {
              const msgCell = beginCell().store(storeMessage(tx.inMessage)).endCell();
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
}

import LRUCache from 'lru-cache';
import { Config, getTonConfig } from './ton.config';
import { mnemonicToPrivateKey } from '@ton/crypto';
import TonWeb from 'tonweb';
import {
  Address,
  address,
  beginCell,
  OpenedContract,
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
import { DEX, pTON } from '@ston-fi/sdk';
import { PollResponse, TonAsset } from './ton.requests';
import fse from 'fs-extra';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { Omniston } from '@ston-fi/omniston-sdk';

import { TonController } from './ton.controller';
import { TokenListType, walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { PtonV1 } from '@ston-fi/sdk/dist/contracts/pTON/v1/PtonV1';
import { RouterV1 } from '@ston-fi/sdk/dist/contracts/dex/v1/RouterV1';
import axios from 'axios';

type AssetListType = TokenListType;

export class Ton {
  public nativeTokenSymbol;
  private _assetMap: Record<string, TonAsset> = {};
  private static _instances: LRUCache<string, Ton>;
  private _network: string;
  public tonweb: TonWeb;
  public tonClient: TonClient;
  public tonClientRouter: OpenedContract<RouterV1>;
  public tonClientproxyTon: PtonV1;
  public omniston: Omniston;
  private _chain: string = 'ton';
  private _ready: boolean = false;
  private _assetListType: AssetListType;
  private _assetListSource: string;
  public config: Config;
  public gasPrice: number;
  public gasLimit: number;
  public gasCost: number;
  public workchain: number;
  public controller: typeof TonController;
  public wallet: any;

  constructor(
    network: string,
    nodeUrl: string,
    assetListType: AssetListType,
    assetListSource: string,
  ) {
    this._network = network;
    this.config = getTonConfig(network);
    this.nativeTokenSymbol = this.config.nativeCurrencySymbol;
    this.tonweb = new TonWeb(new TonWeb.HttpProvider(nodeUrl));
    this.tonClient = new TonClient({ endpoint: nodeUrl });
    this.tonClientRouter = this.tonClient.open(new DEX.v1.Router());
    this.tonClientproxyTon = new pTON.v1();
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

  async getTransaction(txHash: string): Promise<PollResponse | null> {
    const pollInterval = this.config.defaultPollInterval;
    const maxPollAttempts = this.config.defaultMaxPollAttempts;
    const transactionId = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
    const { seqno, root_hash } = await this.getCurrentBlockNumber();

    let attempt = 0;

    while (attempt < maxPollAttempts) {
      try {
        const response = await axios.get(
          `${this.config.network.scanUrl}/api/v3/transactions?hash=${encodeURIComponent(txHash)}`,
          {
            headers: {
              accept: 'application/json, text/plain, */*',
              'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
              origin: this.config.network.scanUrl,
              referer: this.config.network.scanUrl,
              'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
              'x-api-key':
                '1b651340a347951cc8b9a102c406ab2a05226d59d6354aa009049d6fbbb17b0b',
            },
          },
        );

        if (response.status === 200 && response.data) {
          const transactions = response.data.transactions || [];

          const found = transactions.find((tx: any) => tx.hash === txHash);

          if (found) {
            console.log(
              `TON Explorer: https://tonscan.org/transaction/${txHash}`,
            );
            return {
              currentBlock: seqno,
              txBlock: root_hash,
              txHash: transactionId,
              fee: found.fee || 0, // Fee obtida da resposta, se disponível
            };
          }
        }

        attempt++;
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        console.error(
          'Error fetching TON transaction:',
          error.response?.data || error.message || error,
        );

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        attempt++;
      }
    }

    console.warn(
      `Transaction ${txHash} not confirmed after ${maxPollAttempts} attempts.`,
    );

    return null;
  }

  public async getAccountFromPrivateKey(
    mnemonic: string,
  ): Promise<{ publicKey: string; secretKey: string }> {
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
    this.wallet = this.getWallet(
      keyPair.publicKey,
      this.workchain,
      this.config.walletVersion,
    );
    const contract = this.tonClient.open(this.wallet);
    const address = contract.address.toStringBuffer({
      bounceable: false,
      testOnly: true,
    });
    const publicKey = address.toString('base64url');
    const secretKey = keyPair.secretKey.toString('utf8');
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
    this.wallet = this.getWallet(
      keyPair.publicKey,
      this.workchain,
      this.config.walletVersion,
    );
    const contract = this.tonClient.open(this.wallet);
    const publicKey = contract.address.toStringBuffer({
      bounceable: false,
      testOnly: true,
    });
    return {
      publicKey: publicKey.toString('base64url'),
      secretKey: this.wallet.publicKey.toString('utf8'),
    };
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

    const decrpyted = Buffer.concat([
      decipher.update(Buffer.from(encryptedKey, 'hex')),
      decipher.final(),
    ]);

    return decrpyted.toString();
  }

  public async getAssetBalance(
    account: string,
    assetName: string,
  ): Promise<string> {
    const asset = this._assetMap[assetName];
    let balance = 0;

    if (assetName === 'TON') {
      try {
        const response = await this.tonClient.getBalance(address(account));
        balance = Number(response);
      } catch (error: any) {
        if (!error.message.includes('account asset info not found')) {
          throw error;
        }
        balance = 0;
      }
    }

    const amount = balance * parseFloat(`1e-${asset.decimals}`);
    return amount.toString();
  }

  public async getNativeBalance(account: string): Promise<string> {
    const tonAsset = await this.tonClient.getBalance(address(account));
    return tonAsset.toString();
  }

  public getAssetForSymbol(symbol: string): TonAsset | null {
    return this._assetMap[symbol] ? this._assetMap[symbol] : null;
  }

  // here isnt necessary for ton chain
  public async optIn(address: string, symbol: string) {
    const account = await this.getAccountFromAddress(address);
    const block = await this.getCurrentBlockNumber();
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
  ):
    | typeof WalletContractV1R1
    | typeof WalletContractV1R2
    | typeof WalletContractV1R3
    | typeof WalletContractV2R1
    | typeof WalletContractV2R2
    | typeof WalletContractV3R1
    | typeof WalletContractV3R2
    | typeof WalletContractV4
    | typeof WalletContractV5R1
    | typeof WalletContractV5Beta
    | undefined {
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
  ): Promise<string> {
    const walletVersions = this.config.availableWalletVersions;
    let maxNativeTokenBalance = 0;
    let bestWallet = null;
    for (const walletVersion of walletVersions) {
      const walletContractClass =
        this.getWalletContractClassByVersion(walletVersion);
      const wallet = walletContractClass.create({
        workchain,
        publicKey,
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

  public getWallet(publicKey: Buffer, workchain: number, version: string): any {
    const walletContractClass = this.getWalletContractClassByVersion(version);

    if (walletContractClass) {
      return walletContractClass.create({
        workchain,
        publicKey,
      });
    } else {
      return this.getBestWallet(publicKey, workchain);
    }
  }
}

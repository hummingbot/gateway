import { promises as fs } from 'fs';
import { BigNumber, constants } from 'ethers';
import { getTezosConfig } from './tezos.config';
import { logger } from '../../services/logger';
import {
  TokenListType,
  TokenValue,
  walletPath,
} from '../../services/base';
import { PendingOperations, PendingOperationsQueryArguments, RpcClient } from '@taquito/rpc';
import { InMemorySigner } from '@taquito/signer';
import { TezosToolkit, RpcReadAdapter, ContractAbstraction } from '@taquito/taquito';
import {
  TokenResponse,
  TransactionResponse,
  TzktApiClient,
} from './tzkt.api.client';
import axios from 'axios';
import fse from 'fs-extra';
import crypto from 'crypto';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';

export interface WalletData {
  iv: string;
  encryptedPrivateKey: string;
}

export interface TokenInfo {
  chainId: string;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
  standard: string;
  tokenId: number;
}

export class TezosBase {
  private _rpcClient: RpcClient;
  private _provider: TezosToolkit;
  protected tokenList: TokenInfo[] = [];
  private _tokenMap: Record<string, TokenInfo> = {};
  private _contractMap: Record<string, ContractAbstraction<any>> = {};
  private _contractStorageMap: Record<string, any> = {};

  private _ready: boolean = false;
  private _initializing: boolean = false;
  private _initPromise: Promise<void> = Promise.resolve();

  public chainName: string = 'tezos';
  public rpcUrl: string;
  public chainId: string;
  public tokenListSource: string;
  public tokenListType: TokenListType;

  private tzktURL: string;
  private _tzktApiClient: TzktApiClient;

  constructor(network: string) {
    const config = getTezosConfig('tezos', network);
    this.rpcUrl = config.network.nodeURL;
    this.chainId = config.network.chainId;
    this.tzktURL = config.network.tzktURL;
    this.tokenListType = config.network.tokenListType;
    this.tokenListSource = config.network.tokenListSource;
    this._provider = new TezosToolkit(this.rpcUrl);
    this._rpcClient = new RpcClient(this.rpcUrl);
    this._tzktApiClient = new TzktApiClient(this.tzktURL);
  }

  ready(): boolean {
    return this._ready;
  }

  public get provider() {
    return this._provider;
  }

  async init(): Promise<void> {
    if (!this.ready() && !this._initializing) {
      this._initializing = true;
      this._initPromise = this.loadTokens(
        this.tokenListSource,
        this.tokenListType
      ).then(() => {
        this._ready = true;
        this._initializing = false;
      });
      this.provider.setRpcProvider(this.rpcUrl);
    }
    return this._initPromise;
  }

  private async loadTokens(
    tokenListSource: string,
    tokenListType: TokenListType
  ): Promise<void> {
    this.tokenList = await this.getTokenList(tokenListSource, tokenListType);
    if (this.tokenList) {
      this.tokenList.forEach(
        (token: TokenInfo) => (this._tokenMap[token.symbol] = token)
      );
    }
  }

  // returns the contract instance for a given address
  async getContract(address: string) {
    if (!this._contractMap[address]) {
      this._contractMap[address] = await this._provider.contract.at(address);
    }
    return this._contractMap[address];
  }

  // returns the contract storage for a given address (cached for 15 seconds)
  async getContractStorage(address: string) {
    const timestamp = Date.now();
    if (!this._contractStorageMap[address] || timestamp - this._contractStorageMap[address].timestamp > 15000) {
      const contract = await this.getContract(address);
      this._contractStorageMap[address] = {
        storage: await contract.storage(),
        timestamp: Date.now(),
      };
    }
    return this._contractStorageMap[address].storage;
  };

  // return the pending transactions that are currently in the mempool
  async getPendingTransactions(
    args?: PendingOperationsQueryArguments
  ): Promise<PendingOperations> {
    return await this._rpcClient.getPendingOperations(args);
  };

  // returns tokens for a given list source and list type
  async getTokenList(
    tokenListSource: string,
    tokenListType: TokenListType
  ): Promise<TokenInfo[]> {
    let tokens;
    if (tokenListType === 'URL') {
      const result = await axios.get(tokenListSource);
      tokens = result.data;
    } else {
      ({ tokens } = JSON.parse(await fs.readFile(tokenListSource, 'utf8')));
    }
    return tokens;
  }

  // returns the list of the tokens that are stored in the class
  public get storedTokenList(): TokenInfo[] {
    return this.tokenList;
  }

  // return the Token object for a symbol
  getTokenForSymbol(symbol: string): TokenInfo | null {
    return this._tokenMap[symbol] ? this._tokenMap[symbol] : null;
  }

  // returns the native balance
  async getNativeBalance(address: string): Promise<TokenValue> {
    const balance = await this._provider.tz.getBalance(address);
    return { value: BigNumber.from(balance.toString()), decimals: 6 };
  }

  async getNonce(address: string): Promise<number> {
    const rpcReadAdapter = new RpcReadAdapter(this._rpcClient);
    const counter = await rpcReadAdapter.getCounter(address, 'head');
    return Number(counter);
  }

  // returns the token balance, supports FA1.2 and FA2
  async getTokenBalance(
    contractAddress: string,
    walletAddress: string,
    tokenId: number,
    decimals: number
  ): Promise<TokenValue> {
    const tokens: Array<TokenResponse> = await this._tzktApiClient.getTokens(
      walletAddress,
      contractAddress,
      tokenId
    );
    let value = BigNumber.from(0);
    if (tokens.length > 0) {
      value = BigNumber.from(tokens[0].balance);
    }

    return { value, decimals };
  }

  // returns the token allowance, currently only supports only FA2
  async getTokenAllowance(
    contractAddress: string,
    ownerAddress: string,
    spender: string,
    tokenStandard: 'FA2',
    tokenId: number,
    tokenDecimals: number
  ): Promise<TokenValue> {
    const contract = await this._provider.contract.at(contractAddress);

    let value = BigNumber.from(0);
    if (tokenStandard === 'FA2' && tokenId !== null) {
      // TODO: add better support.
      let isOperator;
      try {
        const storage = await contract.storage<any>();
        isOperator = await storage.operators.get({
          0: ownerAddress,
          1: spender,
          2: tokenId
        });
      } catch (e) {
        logger.error('Tezos: Error reading operator from FA2 contract.');
        logger.error(e);
      }
      if (isOperator) {
        value = constants.MaxUint256;
      }
    }

    return { value, decimals: tokenDecimals };
  }

  // returns the transaction details for a given hash
  async getTransaction(txHash: string): Promise<TransactionResponse[]> {
    return this._tzktApiClient.getTransaction(txHash);
  }

  // returns the current block number
  async getCurrentBlockNumber(): Promise<number> {
    const block = await this._provider.rpc.getBlock();
    return block.header.level;
  }

  // returns wallet for a given private key
  async getWalletFromPrivateKey(privateKey: string, setAsSigner: boolean = false): Promise<TezosToolkit> {
    let wallet: TezosToolkit;
    if (setAsSigner) {
      this.provider.setSignerProvider(await InMemorySigner.fromSecretKey(privateKey));
      wallet = this.provider;
    } else {
      wallet = new TezosToolkit(this.rpcUrl);
      wallet.setSignerProvider(await InMemorySigner.fromSecretKey(privateKey));
      wallet.setRpcProvider(this.rpcUrl);
    }
    return wallet;
  }

  // return saved wallet for a given address, if no address is provided, return saved wallet with most balance
  async getWallet(address?: string, password?: string, setAsSigner: boolean = false): Promise<TezosToolkit> {
    const path = `${walletPath}/${this.chainName}`;

    try {
      let rawData = [];
      if (!address) {
        const filenames = fse.readdirSync(`${path}/`);
        for (const filename of filenames) {
          const fileData = await fs.readFile(`${path}/` + filename, 'utf-8');
          rawData.push(fileData);
        }
      } else {
        rawData.push(await fse.readFile(`${path}/${address}.json`, 'utf8'));
      }

      if (rawData.length === 0) {
        logger.error('Tezos: No wallets found');
      }

      if (!password) {
        const passphrase = ConfigManagerCertPassphrase.readPassphrase();
        if (!passphrase) {
          throw new Error('missing passphrase');
        }
        password = passphrase;
      }

      let privateKeys = [];
      for (const data of rawData) {
        const privateKey = this.decrypt(
          data,
          password
        );
        privateKeys.push(privateKey);
      }

      let bestBalance = BigNumber.from(0);
      let bestPrivateKey = privateKeys[0];
      if (privateKeys.length > 1)
        for (const privateKey of privateKeys) {
          const wallet = await this.getWalletFromPrivateKey(privateKey);
          const address = await wallet.signer.publicKeyHash();
          const balance = await this.getNativeBalance(address);
          if (balance.value.gt(bestBalance)) {
            bestBalance = balance.value;
            bestPrivateKey = privateKey;
          }
        }

      return await this.getWalletFromPrivateKey(bestPrivateKey!, setAsSigner);
    } catch (e) {
      logger.error('Tezos: Could not find wallet' + address, e);
      throw e;
    }
  }

  // save encrypted wallet to disk
  public encrypt(privateKey: string, password: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto
      .createHash('sha256')
      .update(String(password))
      .digest('base64')
      .substr(0, 32);
    const encrypter = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encryptedPrivateKey =
      encrypter.update(privateKey, 'utf8', 'hex') + encrypter.final('hex');
    return JSON.stringify({
      iv: iv.toString('hex'),
      encryptedPrivateKey: encryptedPrivateKey.toString(),
    });
  }

  // load encrypted wallet from disk
  decrypt(
    encryptedPrivateKey: string,
    password: string
  ): string {
    const key = crypto
      .createHash('sha256')
      .update(String(password))
      .digest('base64')
      .substr(0, 32);
    const wallet = JSON.parse(encryptedPrivateKey);
    const decrypter = crypto.createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(wallet.iv, 'hex')
    );
    return decrypter.update(wallet.encryptedPrivateKey, 'hex', 'utf8') + decrypter.final('utf8');
  }
}
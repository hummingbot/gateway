import {
  Account as TokenAccount,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { TokenInfo, TokenListContainer } from '@solana/spl-token-registry';
import {
  Account,
  AccountInfo,
  Commitment,
  Connection,
  Keypair,
  LogsCallback,
  LogsFilter,
  ParsedAccountData,
  PublicKey,
  SlotUpdateCallback,
  TokenAmount,
  TransactionResponse,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { BigNumber } from 'ethers';
import fse from 'fs-extra';
import {
  getNotNullOrThrowError,
  runWithRetryAndTimeout,
} from './solana.helpers';
import { countDecimals, TokenValue, walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { Config, getSolanaConfig } from './solana.config';
import { TransactionResponseStatusCode } from './solana.requests';
import { promises as fs } from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import { SolanaController } from './solana.controllers';

export class Solana implements Solanaish {
  public rpcUrl;
  public transactionLamports;

  protected tokenList: TokenInfo[] = [];
  private _config: Config;
  private _tokenMap: Record<string, TokenInfo> = {};
  private _tokenAddressMap: Record<string, TokenInfo> = {};
  private _keypairs: Record<string, Keypair> = {};

  private static _instances: { [name: string]: Solana };

  private _requestCount: number;
  private readonly _connection: Connection;
  private readonly _lamportPrice: number;
  private readonly _lamportDecimals: number;
  private readonly _nativeTokenSymbol: string;
  private readonly _tokenProgramAddress: PublicKey;
  private readonly _network: string;
  private readonly _metricsLogInterval: number;
  // there are async values set in the constructor
  private _ready: boolean = false;
  private initializing: boolean = false;
  public controller: typeof SolanaController;

  constructor(network: string) {
    this._network = network;

    this._config = getSolanaConfig('solana', network);

    this.rpcUrl = this._config.network.nodeURL;

    this._connection = new Connection(this.rpcUrl, 'processed' as Commitment);

    this._nativeTokenSymbol = 'SOL';
    this._tokenProgramAddress = new PublicKey(this._config.tokenProgram);

    this.transactionLamports = this._config.transactionLamports;
    this._lamportPrice = this._config.lamportsToSol;
    this._lamportDecimals = countDecimals(this._lamportPrice);

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this.onDebugMessage('all', this.requestCounter.bind(this));
    setInterval(this.metricLogger.bind(this), this.metricsLogInterval);

    this.controller = SolanaController;
  }

  public get gasPrice(): number {
    return this._lamportPrice;
  }

  public static getInstance(network: string): Solana {
    if (Solana._instances === undefined) {
      Solana._instances = {};
    }
    if (!(network in Solana._instances)) {
      Solana._instances[network] = new Solana(network);
    }

    return Solana._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Solana } {
    return this._instances;
  }

  public get connection() {
    return this._connection;
  }

  public onNewSlot(func: SlotUpdateCallback) {
    this._connection.onSlotUpdate(func);
  }

  public onDebugMessage(filter: LogsFilter, func: LogsCallback) {
    this._connection.onLogs(filter, func);
  }

  async init(): Promise<void> {
    if (!this.ready() && !this.initializing) {
      this.initializing = true;
      await this.loadTokens();
      this._ready = true;
      this.initializing = false;
    }
  }

  ready(): boolean {
    return this._ready;
  }

  async loadTokens(): Promise<void> {
    this.tokenList = await this.getTokenList();
    this.tokenList.forEach((token: TokenInfo) => {
      this._tokenMap[token.symbol] = token;
      this._tokenAddressMap[token.address] = token;
    });
  }

  // returns a Tokens for a given list source and list type
  async getTokenList(): Promise<TokenInfo[]> {
    const tokens: TokenInfo[] =
      await new CustomStaticTokenListResolutionStrategy(
        this._config.network.tokenListSource,
        this._config.network.tokenListType
      ).resolve();

    const tokenListContainer = new TokenListContainer(tokens);

    return tokenListContainer.filterByClusterSlug(this._network).getList();
  }

  // returns the price of 1 lamport in SOL
  public get lamportPrice(): number {
    return this._lamportPrice;
  }

  // solana token lists are large. instead of reloading each time with
  // getTokenList, we can read the stored tokenList value from when the
  // object was initiated.
  public get storedTokenList(): TokenInfo[] {
    return Object.values(this._tokenMap);
  }

  // return the TokenInfo object for a symbol
  getTokenForSymbol(symbol: string): TokenInfo | null {
    return this._tokenMap[symbol] ?? null;
  }

  // return the TokenInfo object for a symbol
  getTokenForMintAddress(mintAddress: PublicKey): TokenInfo | null {
    return this._tokenAddressMap[mintAddress.toString()]
      ? this._tokenAddressMap[mintAddress.toString()]
      : null;
  }

  // returns Keypair for a private key, which should be encoded in Base58
  getKeypairFromPrivateKey(privateKey: string): Keypair {
    const decoded = bs58.decode(privateKey);

    return Keypair.fromSecretKey(decoded);
  }

  async getAccount(address: string): Promise<Account> {
    const keypair = await this.getKeypair(address);

    return new Account(keypair.secretKey);
  }

  /**
   *
   * @param walletAddress
   * @param tokenMintAddress
   */
  async findAssociatedTokenAddress(
    walletAddress: PublicKey,
    tokenMintAddress: PublicKey
  ): Promise<PublicKey> {
    const tokenProgramId = this._tokenProgramAddress;
    const splAssociatedTokenAccountProgramId = (
      await runWithRetryAndTimeout(
        this.connection,
        this.connection.getParsedTokenAccountsByOwner,
        [
          walletAddress,
          {
            programId: this._tokenProgramAddress,
          },
        ]
      )
    ).value.map((item) => item.pubkey)[0];

    const programAddress = (
      await runWithRetryAndTimeout(PublicKey, PublicKey.findProgramAddress, [
        [
          walletAddress.toBuffer(),
          tokenProgramId.toBuffer(),
          tokenMintAddress.toBuffer(),
        ],
        splAssociatedTokenAccountProgramId,
      ])
    )[0];

    return programAddress;
  }

  async getKeypair(address: string): Promise<Keypair> {
    if (!this._keypairs[address]) {
      const path = `${walletPath}/solana`;

      const encryptedPrivateKey: string = await fse.readFile(
        `${path}/${address}.json`,
        'utf8'
      );

      const passphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!passphrase) {
        throw new Error('missing passphrase');
      }
      const decrypted = await this.decrypt(encryptedPrivateKey, passphrase);

      this._keypairs[address] = Keypair.fromSecretKey(bs58.decode(decrypted));
    }

    return this._keypairs[address];
  }

  async encrypt(secret: string, password: string): Promise<string> {
    const algorithm = 'aes-256-ctr';
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, salt, 5000, 32, 'sha512');
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);

    const ivJSON = iv.toJSON();
    const saltJSON = salt.toJSON();
    const encryptedJSON = encrypted.toJSON();

    return JSON.stringify({
      algorithm,
      iv: ivJSON,
      salt: saltJSON,
      encrypted: encryptedJSON,
    });
  }

  async decrypt(encryptedSecret: string, password: string): Promise<string> {
    const hash = JSON.parse(encryptedSecret);
    const salt = Buffer.from(hash.salt, 'utf8');
    const iv = Buffer.from(hash.iv, 'utf8');

    const key = crypto.pbkdf2Sync(password, salt, 5000, 32, 'sha512');

    const decipher = crypto.createDecipheriv(hash.algorithm, key, iv);

    const decrpyted = Buffer.concat([
      decipher.update(Buffer.from(hash.encrypted, 'hex')),
      decipher.final(),
    ]);

    return decrpyted.toString();
  }

  async getBalances(wallet: Keypair): Promise<Record<string, TokenValue>> {
    let balances: Record<string, TokenValue> = {};

    balances['UNWRAPPED_SOL'] = await runWithRetryAndTimeout(
      this,
      this.getSolBalance,
      [wallet]
    );

    const allSplTokens = await runWithRetryAndTimeout(
      this.connection,
      this.connection.getParsedTokenAccountsByOwner,
      [wallet.publicKey, { programId: this._tokenProgramAddress }]
    );

    allSplTokens.value.forEach(
      (tokenAccount: {
        pubkey: PublicKey;
        account: AccountInfo<ParsedAccountData>;
      }) => {
        const tokenInfo = tokenAccount.account.data.parsed['info'];
        const symbol = this.getTokenForMintAddress(tokenInfo['mint'])?.symbol;
        if (symbol != null)
          balances[symbol] = this.tokenResponseToTokenValue(
            tokenInfo['tokenAmount']
          );
      }
    );

    let allSolBalance = BigNumber.from(0);
    let allSolDecimals;

    if (balances['UNWRAPPED_SOL'] && balances['UNWRAPPED_SOL'].value) {
      allSolBalance = allSolBalance.add(balances['UNWRAPPED_SOL'].value);
      allSolDecimals = balances['UNWRAPPED_SOL'].decimals;
    }

    if (balances['SOL'] && balances['SOL'].value) {
      allSolBalance = allSolBalance.add(balances['SOL'].value);
      allSolDecimals = balances['SOL'].decimals;
    } else {
      balances['SOL'] = {
        value: allSolBalance,
        decimals: getNotNullOrThrowError<number>(allSolDecimals),
      };
    }

    balances['ALL_SOL'] = {
      value: allSolBalance,
      decimals: getNotNullOrThrowError<number>(allSolDecimals),
    };

    balances = Object.keys(balances)
      .sort((key1: string, key2: string) =>
        key1.toUpperCase().localeCompare(key2.toUpperCase())
      )
      .reduce((target: Record<string, TokenValue>, key) => {
        target[key] = balances[key];

        return target;
      }, {});

    return balances;
  }

  // returns the SOL balance, convert BigNumber to string
  async getSolBalance(wallet: Keypair): Promise<TokenValue> {
    const lamports = await runWithRetryAndTimeout(
      this.connection,
      this.connection.getBalance,
      [wallet.publicKey]
    );
    return { value: BigNumber.from(lamports), decimals: this._lamportDecimals };
  }

  tokenResponseToTokenValue(account: TokenAmount): TokenValue {
    return {
      value: BigNumber.from(account.amount),
      decimals: account.decimals,
    };
  }

  // returns the balance for an SPL token
  public async getSplBalance(
    walletAddress: PublicKey,
    mintAddress: PublicKey
  ): Promise<TokenValue> {
    const response = await runWithRetryAndTimeout(
      this.connection,
      this.connection.getParsedTokenAccountsByOwner,
      [walletAddress, { mint: mintAddress }]
    );
    if (response['value'].length == 0) {
      throw new Error(`Token account not initialized`);
    }
    return this.tokenResponseToTokenValue(
      response.value[0].account.data.parsed['info']['tokenAmount']
    );
  }

  // returns whether the token account is initialized, given its mint address
  async isTokenAccountInitialized(
    walletAddress: PublicKey,
    mintAddress: PublicKey
  ): Promise<boolean> {
    const response = await runWithRetryAndTimeout(
      this.connection,
      this.connection.getParsedTokenAccountsByOwner,
      [walletAddress, { programId: this._tokenProgramAddress }]
    );
    for (const accountInfo of response.value) {
      if (
        accountInfo.account.data.parsed['info']['mint'] ==
        mintAddress.toBase58()
      )
        return true;
    }
    return false;
  }

  // returns token account if is initialized, given its mint address
  public async getTokenAccount(
    walletAddress: PublicKey,
    mintAddress: PublicKey
  ): Promise<{
    pubkey: PublicKey;
    account: AccountInfo<ParsedAccountData>;
  } | null> {
    const response = await runWithRetryAndTimeout(
      this.connection,
      this.connection.getParsedTokenAccountsByOwner,
      [walletAddress, { programId: this._tokenProgramAddress }]
    );
    for (const accountInfo of response.value) {
      if (
        accountInfo.account.data.parsed['info']['mint'] ==
        mintAddress.toBase58()
      )
        return accountInfo;
    }
    return null;
  }

  // Gets token account information, or creates a new token account for given token mint address
  // if needed, which costs 0.035 SOL
  async getOrCreateAssociatedTokenAccount(
    wallet: Keypair,
    tokenAddress: PublicKey
  ): Promise<TokenAccount | null> {
    return getOrCreateAssociatedTokenAccount(
      this._connection,
      wallet,
      tokenAddress,
      wallet.publicKey
    );
  }

  // returns an ethereum TransactionResponse for a txHash.
  async getTransaction(
    payerSignature: string
  ): Promise<VersionedTransactionResponse | null> {
    const fetchedTx = runWithRetryAndTimeout(
      this._connection,
      this._connection.getTransaction,
      [
        payerSignature,
        {
          commitment: 'confirmed',
        },
      ]
    );

    return fetchedTx;
  }

  // returns an ethereum TransactionResponseStatusCode for a txData.
  public async getTransactionStatusCode(
    txData: TransactionResponse | null
  ): Promise<TransactionResponseStatusCode> {
    let txStatus;
    if (!txData) {
      // tx not found, didn't reach the mempool or it never existed
      txStatus = TransactionResponseStatusCode.FAILED;
    } else {
      txStatus =
        txData.meta?.err == null
          ? TransactionResponseStatusCode.CONFIRMED
          : TransactionResponseStatusCode.FAILED;

      // TODO implement TransactionResponseStatusCode PROCESSED, FINALISED,
      //  based on how many blocks ago the Transaction was
    }
    return txStatus;
  }

  public getTokenBySymbol(tokenSymbol: string): TokenInfo | undefined {
    return this.tokenList.find(
      (token: TokenInfo) =>
        token.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    );
  }

  // returns the current slot number
  async getCurrentSlotNumber(): Promise<number> {
    return await runWithRetryAndTimeout(
      this._connection,
      this._connection.getSlot,
      []
    );
  }

  public requestCounter(msg: any): void {
    if (msg.action === 'request') this._requestCount += 1;
  }

  public metricLogger(): void {
    logger.info(
      this.requestCount +
        ' request(s) sent in last ' +
        this.metricsLogInterval / 1000 +
        ' seconds.'
    );
    this._requestCount = 0; // reset
  }

  public get network(): string {
    return this._network;
  }

  public get nativeTokenSymbol(): string {
    return this._nativeTokenSymbol;
  }

  public get requestCount(): number {
    return this._requestCount;
  }

  public get metricsLogInterval(): number {
    return this._metricsLogInterval;
  }

  // returns the current block number
  async getCurrentBlockNumber(): Promise<number> {
    return await runWithRetryAndTimeout(
      this.connection,
      this.connection.getSlot,
      ['processed']
    );
  }

  async close() {
    if (this._network in Solana._instances) {
      delete Solana._instances[this._network];
    }
  }
}

class CustomStaticTokenListResolutionStrategy {
  resolve: () => Promise<any>;

  constructor(url: string, type: string) {
    this.resolve = async () => {
      if (type === 'FILE') {
        return JSON.parse(await fs.readFile(url, 'utf8'))['tokens'];
      } else {
        return (await runWithRetryAndTimeout<any>(axios, axios.get, [url]))
          .data['tokens'];
      }
    };
  }
}

export type Solanaish = Solana;
export const Solanaish = Solana;

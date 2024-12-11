import { promises as fs } from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import bs58 from 'bs58';
import { BigNumber } from 'ethers';
import fse from 'fs-extra';

import { TokenInfo, TokenListContainer } from '@solana/spl-token-registry';
import {
  AccountInfo,
  clusterApiUrl,
  Cluster,
  Commitment,
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  ComputeBudgetProgram,
  SignatureStatus,
  Signer,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  TokenAmount,
  TransactionResponse,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { Client, UtlConfig, Token } from '@solflare-wallet/utl-sdk';

import { countDecimals, TokenValue, walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';

import {
  getNotNullOrThrowError,
  runWithRetryAndTimeout,
} from './solana.helpers';
import { Config, getSolanaConfig } from './solana.config';
import { TransactionResponseStatusCode } from './solana.requests';
import { SolanaController } from './solana.controllers';

// Add accounts from https://triton.one/solana-prioritization-fees/ to track general fees
const PRIORITY_FEE_ACCOUNTS = [
  '4qGj88CX3McdTXEviEaqeP2pnZJxRTsZFWyU3Mrnbku4',
  '2oLNTQKRb4a2117kFi6BYTUDu3RPrMVAHFhCfPKMosxX',
  'xKUz6fZ79SXnjGYaYhhYTYQBoRUBoCyuDMkBa1tL3zU',
  'GASeo1wEK3Rwep6fsAt212Jw9zAYguDY5qUwTnyZ4RH',
  'B8emFMG91JJsBELV4XVkTNe3YTs85x4nCqub7dRZUY1p',
  'DteH7aNKykAG2b2KQo7DD9XvLBfNgAuf2ixj5HC7ppTk',
  '5HngGmYzvSuh3XyU11brHDpMTHXQQRQQT4udGFtQSjgR',
  'GD37bnQdGkDsjNqnVGr9qWTnQJSKMHbsiXX9tXLMUcaL',
  '4po3YMfioHkNP4mL4N46UWJvBoQDS2HFjzGm1ifrUWuZ',
  '5veMSa4ks66zydSaKSPMhV7H2eF88HvuKDArScNH9jaG',
];

const GET_SIGNATURES_FOR_ADDRESS_LIMIT = 100;
const MAX_PRIORITY_FEE=400000
const MIN_PRIORITY_FEE=100000
const PRIORITY_FEE_LEVEL='high'
// Available levels: min, low, medium, high, veryHigh, unsafeMax

interface PriorityFeeRequestPayload {
  method: string;
  params: string[][];
  id: number;
  jsonrpc: string;
}

interface PriorityFeeResponse {
  jsonrpc: string;
  result: Array<{
    prioritizationFee: number;
    slot: number;
  }>;
  id: number;
}

interface PriorityFeeEstimates {
  min: number;
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
  unsafeMax: number;
}

class ConnectionPool {
  private connections: Connection[] = [];
  private currentIndex: number = 0;

  constructor(urls: string[]) {
    this.connections = urls.map((url) => new Connection(url, { commitment: 'confirmed' }));
  }

  public getNextConnection(): Connection {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return connection;
  }

  public getAllConnections(): Connection[] {
    return this.connections;
  }
}

export let priorityFeeMultiplier: number = 1;

export class Solana implements Solanaish {
  public transactionLamports;
  public connectionPool: ConnectionPool;
  public network: string;
  public nativeTokenSymbol: string;

  protected tokenList: TokenInfo[] = [];
  private _config: Config;
  private _tokenMap: Record<string, TokenInfo> = {};
  private _tokenAddressMap: Record<string, TokenInfo> = {};
  private _utl: Client;

  private static _instances: { [name: string]: Solana };

  private readonly _connection: Connection;
  private readonly _lamportPrice: number;
  private readonly _lamportDecimals: number;
  private readonly _tokenProgramAddress: PublicKey;

  // there are async values set in the constructor
  private _ready: boolean = false;
  private initializing: boolean = false;
  public controller: typeof SolanaController;

  constructor(network: string) {
    this.network = network;
    this.nativeTokenSymbol = 'SOL';

    this._config = getSolanaConfig('solana', network);

    // Parse comma-separated RPC URLs
    const rpcUrlsString = this._config.network.nodeURLs;
    const rpcUrls: string[] = [];

    if (rpcUrlsString) {
      // Split and trim URLs, filter out empty strings
      const urls = rpcUrlsString
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url !== '');
      rpcUrls.push(...urls);
    }

    // Add default cluster URL if no URLs provided
    if (rpcUrls.length === 0) {
      rpcUrls.push(clusterApiUrl(this.network as Cluster));
    }
    
    this._connection = new Connection(rpcUrls[0], 'processed' as Commitment);
    this.connectionPool = new ConnectionPool(rpcUrls);

    this._tokenProgramAddress = new PublicKey(this._config.tokenProgram);

    this.transactionLamports = this._config.transactionLamports;
    this._lamportPrice = this._config.lamportsToSol;
    this._lamportDecimals = countDecimals(this._lamportPrice);

    this.controller = SolanaController;

    // initialize UTL client
    const config = new UtlConfig({
      chainId: this.network === 'devnet' ? 103 : 101,
      timeout: 2000,
      connection: this.connectionPool.getNextConnection(), // Use connection from pool
      apiUrl: 'https://token-list-api.solana.cloud',
      cdnUrl: 'https://cdn.jsdelivr.net/gh/solflare-wallet/token-list/solana-tokenlist.json',
    });
    this._utl = new Client(config);

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

  public async getTokenByAddress(tokenAddress: string, useApi: boolean = false): Promise<Token> {
    if (useApi && this.network !== 'mainnet-beta') {
      throw new Error('API usage is only allowed on mainnet-beta');
    }

    const publicKey = new PublicKey(tokenAddress);
    let token: Token;

    if (useApi) {
      token = await this._utl.fetchMint(publicKey);
    } else {
      const tokenList = await this.getTokenList();
      const foundToken = tokenList.find((t) => t.address === tokenAddress);
      if (!foundToken) {
        throw new Error('Token not found in the token list');
      }
      token = foundToken as unknown as Token;
    }

    return token;
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

    return tokenListContainer.filterByClusterSlug(this.network).getList();
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

  // returns Keypair for a private key, which should be encoded in Base58
  getKeypairFromPrivateKey(privateKey: string): Keypair {
    const decoded = bs58.decode(privateKey);

    return Keypair.fromSecretKey(decoded);
  }

  async getWallet(address: string): Promise<Keypair> {
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

    return Keypair.fromSecretKey(bs58.decode(decrypted));
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

  // return the TokenInfo object for a symbol
  private getTokenForMintAddress(mintAddress: PublicKey): TokenInfo | null {
    return this._tokenAddressMap[mintAddress.toString()]
      ? this._tokenAddressMap[mintAddress.toString()]
      : null;
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
    if (this.network in Solana._instances) {
      delete Solana._instances[this.network];
    }
  }

  async fetchEstimatePriorityFees(rcpURL: string): Promise<PriorityFeeEstimates> {
    try {
      const maxPriorityFee = MAX_PRIORITY_FEE;
      const minPriorityFee = MIN_PRIORITY_FEE;

      // Only include params that are defined
      const params: string[][] = [];
      params.push(PRIORITY_FEE_ACCOUNTS);
      const payload: PriorityFeeRequestPayload = {
        method: 'getRecentPrioritizationFees',
        params: params,
        id: 1,
        jsonrpc: '2.0',
      };

      const response = await fetch(rcpURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
        throw new Error(`Failed to fetch fees: ${response.status}`);
      }

      const data: PriorityFeeResponse = await response.json();

      // Process the response to categorize fees
      const fees = data.result.map((item) => item.prioritizationFee);

      // Filter out fees lower than the minimum fee for calculations
      const nonZeroFees = fees.filter((fee) => fee >= minPriorityFee);
      nonZeroFees.sort((a, b) => a - b); // Sort non-zero fees in ascending order

      if (nonZeroFees.length === 0) {
        nonZeroFees.push(minPriorityFee); // Add one entry of min fee if no fees are available
      }

      const min = Math.min(...nonZeroFees);
      const low = nonZeroFees[Math.floor(nonZeroFees.length * 0.2)];
      const medium = nonZeroFees[Math.floor(nonZeroFees.length * 0.4)];
      const high = nonZeroFees[Math.floor(nonZeroFees.length * 0.6)];
      const veryHigh = nonZeroFees[Math.floor(nonZeroFees.length * 0.8)];
      const unsafeMax = Math.max(...nonZeroFees);

      const result = {
        min: Math.max(min, minPriorityFee),
        low: Math.max(Math.min(low, maxPriorityFee), minPriorityFee),
        medium: Math.max(Math.min(medium, maxPriorityFee), minPriorityFee),
        high: Math.max(Math.min(high, maxPriorityFee), minPriorityFee),
        veryHigh: Math.max(Math.min(veryHigh, maxPriorityFee), minPriorityFee),
        unsafeMax: Math.max(Math.min(unsafeMax, maxPriorityFee), minPriorityFee),
      };

      console.debug('[PRIORITY FEES] Calculated priority fees:', result);

      return result;
    } catch (error: any) {
      console.error(`Failed to fetch estimate priority fees: ${error.message}`);
      throw new Error(`Failed to fetch estimate priority fees: ${error.message}`);
    }
  }

  public async confirmTransaction(
    signature: string,
    connection: Connection,
    timeout: number = 3000,
  ): Promise<boolean> {
    try {
      const confirmationPromise = new Promise<boolean>(async (resolve, reject) => {
        const payload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignatureStatuses',
          params: [
            [signature],
            {
              searchTransactionHistory: true,
            },
          ],
        };

        const response = await fetch(connection.rpcEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          reject(new Error(`HTTP error! status: ${response.status}`));
          return;
        }

        const data = await response.json();

        if (data.result && data.result.value && data.result.value[0]) {
          const status: SignatureStatus = data.result.value[0];
          if (status.err !== null) {
            reject(new Error(`Transaction failed with error: ${JSON.stringify(status.err)}`));
            return;
          }
          const isConfirmed =
            status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized';
          resolve(isConfirmed);
        } else {
          resolve(false);
        }
      });

      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Confirmation timed out')), timeout),
      );

      return await Promise.race([confirmationPromise, timeoutPromise]);
    } catch (error: any) {
      console.error('Error confirming transaction:', error.message);
      throw new Error(`Failed to confirm transaction: ${error.message}`);
    }
  }

  public async confirmTransactionByAddress(
    address: string,
    signature: string,
    connection: Connection,
    timeout: number = 3000,
  ): Promise<boolean> {
    try {
      const confirmationPromise = new Promise<boolean>(async (resolve, reject) => {
        const payload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [
            address,
            {
              limit: GET_SIGNATURES_FOR_ADDRESS_LIMIT, // Adjust the limit as needed
              until: signature,
            },
          ],
        };

        const response = await fetch(connection.rpcEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          reject(new Error(`HTTP error! status: ${response.status}`));
          return;
        }

        const data = await response.json();

        if (data.result) {
          const transactionInfo = data.result.find((entry: any) => entry.signature === signature);

          if (!transactionInfo) {
            resolve(false);
            return;
          }

          if (transactionInfo.err !== null) {
            reject(
              new Error(`Transaction failed with error: ${JSON.stringify(transactionInfo.err)}`),
            );
            return;
          }

          const isConfirmed =
            transactionInfo.confirmationStatus === 'confirmed' ||
            transactionInfo.confirmationStatus === 'finalized';
          resolve(isConfirmed);
        } else {
          resolve(false);
        }
      });

      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Confirmation timed out')), timeout),
      );

      return await Promise.race([confirmationPromise, timeoutPromise]);
    } catch (error: any) {
      console.error('Error confirming transaction using signatures:', error.message);
      throw new Error(`Failed to confirm transaction using signatures: ${error.message}`);
    }
  }

  async sendAndConfirmTransaction(tx: Transaction, signers: Signer[] = []): Promise<string> {
    const priorityFeesEstimate = await this.fetchEstimatePriorityFees(
      this.connectionPool.getNextConnection().rpcEndpoint,
    );

    const validFeeLevels = ['min', 'low', 'medium', 'high', 'veryHigh', 'unsafeMax'];
    const priorityFeeLevel = PRIORITY_FEE_LEVEL || 'medium';

    // Ensure the priorityFeeLevel is valid, otherwise default to 'high'
    const selectedPriorityFee = validFeeLevels.includes(priorityFeeLevel)
      ? priorityFeesEstimate[priorityFeeLevel]
      : priorityFeesEstimate.medium;

    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: selectedPriorityFee * Math.max(priorityFeeMultiplier, 1),
    });

    tx.instructions.push(priorityFeeInstruction);

    const blockhashAndContext = await this.connectionPool
      .getNextConnection()
      .getLatestBlockhashAndContext('confirmed');
    const lastValidBlockHeight = blockhashAndContext.value.lastValidBlockHeight;
    const blockhash = blockhashAndContext.value.blockhash;

    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);

    const signature = await this.sendAndConfirmRawTransaction(
      tx.serialize(),
      signers[0].publicKey.toBase58(),
      lastValidBlockHeight,
    );

    // Decrease priority fee multiplier if transaction is successful
    this.decreasePriorityFeeMultiplier();

    return signature;
  }

  async sendAndConfirmRawTransaction(
    rawTx: Buffer | Uint8Array | Array<number>,
    payerAddress: string,
    lastValidBlockHeight: number,
  ): Promise<string> {
    let blockheight = await this.connectionPool
      .getNextConnection()
      .getBlockHeight({ commitment: 'confirmed' });

    let signature: string;
    let signatures: string[];
    let confirmations: boolean[];

    while (blockheight <= lastValidBlockHeight + 50) {
      const sendRawTransactionResults = await Promise.allSettled(
        this.connectionPool.getAllConnections().map((conn) =>
          conn.sendRawTransaction(rawTx, {
            skipPreflight: true,
            preflightCommitment: 'confirmed',
            maxRetries: 0,
          }),
        ),
      );

      const successfulResults = sendRawTransactionResults.filter(
        (result) => result.status === 'fulfilled',
      );

      if (successfulResults.length > 0) {
        // Map all successful results to get their values (signatures)
        signatures = successfulResults
          .map((result) => (result.status === 'fulfilled' ? result.value : ''));
      } else {
        // All promises failed
        console.error('All connections failed to send the transaction.');
        throw new Error('All connections failed to send the transaction.');
      }

      // Verify all signatures match
      if (!signatures.every((sig) => sig === signatures[0])) {
        console.error('Signatures do not match across connections.');
        throw new Error('Signature mismatch between connections.');
      }

      signature = signatures[0];

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check confirmation across all connections
      const confirmTransactionResults = await Promise.allSettled(
        this.connectionPool
          .getAllConnections()
          .flatMap((conn) => [
            this.confirmTransaction(signature, conn),
            this.confirmTransactionByAddress(payerAddress, signature, conn),
          ]),
      );

      const successfulConfirmations = confirmTransactionResults.filter(
        (result) => result.status === 'fulfilled',
      );

      const rejectedConfirmations = confirmTransactionResults.filter(
        (result) => result.status === 'rejected',
      );

      rejectedConfirmations.forEach((result) => {
        if (result.status === 'rejected' && result.reason.message.includes('InstructionError')) {
          console.error(result.reason.message);
          throw new Error(result.reason.message);
        }
      });

      if (successfulConfirmations.length > 0) {
        // Map all successful results to get their values (signatures)
        confirmations = successfulConfirmations
          .map((result) => (result.status === 'fulfilled' ? result.value : false));
      } else {
        // All promises failed
        console.error('All connections failed to confirm the transaction.');
        throw new Error('All connections failed to confirm the transaction.');
      }

      if (confirmations.some((confirmed) => confirmed)) {
        return signature;
      }

      blockheight = await this.connectionPool
        .getNextConnection()
        .getBlockHeight({ commitment: 'confirmed' });
    }

    console.error('Transaction could not be confirmed within the valid block height range.');
    this.increasePriorityFeeMultiplier();
    throw new TransactionExpiredBlockheightExceededError(signature);
  }

  async extractTokenBalanceChangeAndFee(
    signature: string,
    mint: string,
    owner: string,
  ): Promise<{ balanceChange: number; fee: number }> {
    let txDetails;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        txDetails = await this.connectionPool.getNextConnection().getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (txDetails) {
          break; // Exit loop if txDetails is not null
        } else {
          throw new Error('Transaction details are null');
        }
      } catch (error: any) {
        if (attempt < 10) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          // Return default values after 10 attempts
          console.error(`Error fetching transaction details: ${error.message}`);
          return { balanceChange: 0, fee: 0 };
        }
      }
    }

    const preTokenBalances = txDetails.meta?.preTokenBalances || [];
    const postTokenBalances = txDetails.meta?.postTokenBalances || [];

    const preBalance =
      preTokenBalances.find((balance) => balance.mint === mint && balance.owner === owner)
        ?.uiTokenAmount.uiAmount || 0;

    const postBalance =
      postTokenBalances.find((balance) => balance.mint === mint && balance.owner === owner)
        ?.uiTokenAmount.uiAmount || 0;

    const balanceChange = postBalance - preBalance;
    const fee = (txDetails.meta?.fee || 0) / 1_000_000_000; // Convert lamports to SOL

    return { balanceChange, fee };
  }

  async extractAccountBalanceChangeAndFee(
    signature: string,
    accountIndex: number,
  ): Promise<{ balanceChange: number; fee: number }> {
    let txDetails;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        txDetails = await this.connectionPool.getNextConnection().getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (txDetails) {
          break; // Exit loop if txDetails is not null
        } else {
          throw new Error('Transaction details are null');
        }
      } catch (error: any) {
        if (attempt < 19) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          // Return default values after 10 attempts
          console.error(`Error fetching transaction details: ${error.message}`);
          return { balanceChange: 0, fee: 0 };
        }
      }
    }

    const preBalances = txDetails.meta?.preBalances || [];
    const postBalances = txDetails.meta?.postBalances || [];

    const balanceChange =
      Math.abs(postBalances[accountIndex] - preBalances[accountIndex]) / 1_000_000_000;
    const fee = (txDetails.meta?.fee || 0) / 1_000_000_000; // Convert lamports to SOL

    return { balanceChange, fee };
  }

  private increasePriorityFeeMultiplier(): void {
    priorityFeeMultiplier += 3;
    console.debug(`[PRIORITY FEE] Increased priorityFeeMultiplier to: ${priorityFeeMultiplier}`);
  }

  private decreasePriorityFeeMultiplier(): void {
    if (priorityFeeMultiplier <= 1) {
      priorityFeeMultiplier = 1;
      console.debug(
        `[PRIORITY FEE] Set priorityFeeMultiplier to minimum value: ${priorityFeeMultiplier}`,
      );
      return;
    }

    if (priorityFeeMultiplier > 1) {
      priorityFeeMultiplier -= 1;
      console.debug(`[PRIORITY FEE] Decreased priorityFeeMultiplier to: ${priorityFeeMultiplier}`);
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

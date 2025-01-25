import crypto from 'crypto';
import bs58 from 'bs58';
import { BigNumber } from 'ethers';
import fse from 'fs-extra';
import { TokenListType } from '../../services/base';

import { TokenInfo } from '@solana/spl-token-registry';
import {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  Signer,
  Transaction,
  TokenAmount,
  TransactionResponse,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";

import { TokenValue, walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { TokenListResolutionStrategy } from '../../services/token-list-resolution';
import { Config, getSolanaConfig } from './solana.config';
import { SolanaController } from './solana.controllers';

// Constants used for fee calculations
export const BASE_FEE = 5000;
const TOKEN_PROGRAM_ADDRESS = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const LAMPORT_TO_SOL = 1 / Math.pow(10, 9);

enum TransactionResponseStatusCode {
  FAILED = -1,
  UNCONFIRMED = 0,
  CONFIRMED = 1,  
}

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

interface PriorityFeeResponse {
  jsonrpc: string;
  result: Array<{
    prioritizationFee: number;
    slot: number;
  }>;
  id: number;
}

export class Solana {
  public connection: Connection;
  public network: string;
  public nativeTokenSymbol: string;

  public tokenList: TokenInfo[] = [];
  public config: Config;
  private _tokenMap: Record<string, TokenInfo> = {};

  private static _instances: { [name: string]: Solana };
  public controller: typeof SolanaController;

  private static lastPriorityFeeEstimate: {
    timestamp: number;
    fee: number;
  } | null = null;
  private static PRIORITY_FEE_CACHE_MS = 10000; // 10 second cache

  private constructor(network: string) {
    this.network = network;
    this.config = getSolanaConfig('solana', network);
    this.nativeTokenSymbol = this.config.network.nativeCurrencySymbol;
    this.connection = new Connection(this.config.network.nodeURL, { commitment: 'confirmed' });
    this.controller = SolanaController;
  }

  public static async getInstance(network: string): Promise<Solana> {
    if (!Solana._instances) {
      Solana._instances = {};
    }
    if (!Solana._instances[network]) {
      const instance = new Solana(network);
      await instance.init();
      Solana._instances[network] = instance;
    }
    return Solana._instances[network];
  }

  private async init(): Promise<void> {
    try {
      await this.loadTokens(
        this.config.network.tokenListSource, 
        this.config.network.tokenListType
      );
    } catch (e) {
      logger.error(`Failed to initialize ${this.network}: ${e}`);
      throw e;
    }
  }

  async getTokenList(
    tokenListSource?: string,
    tokenListType?: TokenListType
  ): Promise<TokenInfo[]> {
    // If no source/type provided, return stored list
    if (!tokenListSource || !tokenListType) {
      return this.tokenList;
    }
    
    // Otherwise fetch new list
    const tokens = await new TokenListResolutionStrategy(
      tokenListSource,
      tokenListType
    ).resolve();
    return tokens;
  }

  async loadTokens(
    tokenListSource: string,
    tokenListType: TokenListType
  ): Promise<void> {
    try {
      // Get tokens from source
      const tokens = await new TokenListResolutionStrategy(
        tokenListSource,
        tokenListType
      ).resolve();

      this.tokenList = tokens;
      
      // Create symbol -> token mapping
      tokens.forEach((token: TokenInfo) => {
        this._tokenMap[token.symbol] = token;
      });

      logger.info(`Loaded ${tokens.length} tokens for ${this.network}`);
    } catch (error) {
      logger.error(`Failed to load token list for ${this.network}: ${error.message}`);
      throw error;
    }
  }

  public getTokenBySymbol(tokenSymbol: string): TokenInfo | undefined {
    // Normalize both strings by converting to uppercase and removing any spaces
    const normalizedSearch = tokenSymbol.toUpperCase().trim();
    return this.tokenList.find(
      (token: TokenInfo) => token.symbol.toUpperCase().trim() === normalizedSearch
    );
  }

  // returns Keypair for a private key, which should be encoded in Base58
  getKeypairFromPrivateKey(privateKey: string): Keypair {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(new Uint8Array(decoded));
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

    return Keypair.fromSecretKey(new Uint8Array(bs58.decode(decrypted)));
  }

  async encrypt(secret: string, password: string): Promise<string> {
    const algorithm = 'aes-256-ctr';
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, new Uint8Array(salt), 5000, 32, 'sha512');
    const cipher = crypto.createCipheriv(algorithm, new Uint8Array(key), new Uint8Array(iv));
    
    const encryptedBuffers = [
      new Uint8Array(cipher.update(new Uint8Array(Buffer.from(secret)))),
      new Uint8Array(cipher.final())
    ];
    const encrypted = Buffer.concat(encryptedBuffers);

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
    const salt = new Uint8Array(Buffer.from(hash.salt, 'utf8'));
    const iv = new Uint8Array(Buffer.from(hash.iv, 'utf8'));

    const key = crypto.pbkdf2Sync(password, salt, 5000, 32, 'sha512');

    const decipher = crypto.createDecipheriv(
      hash.algorithm, 
      new Uint8Array(key), 
      iv
    );

    const decryptedBuffers = [
      new Uint8Array(decipher.update(new Uint8Array(Buffer.from(hash.encrypted, 'hex')))),
      new Uint8Array(decipher.final())
    ];
    const decrypted = Buffer.concat(decryptedBuffers);

    return decrypted.toString();
  }

  async getBalance(wallet: Keypair, symbols?: string[]): Promise<Record<string, number>> {
    // Convert symbols to uppercase for case-insensitive matching
    const upperCaseSymbols = symbols?.map(s => s.toUpperCase());
    const publicKey = wallet.publicKey;
    let balances: Record<string, number> = {};

    // Fetch SOL balance only if symbols is undefined or includes "SOL" (case-insensitive)
    if (!upperCaseSymbols || upperCaseSymbols.includes("SOL")) {
      const solBalance = await this.connection.getBalance(publicKey);
      const solBalanceInSol = solBalance * LAMPORT_TO_SOL;
      balances["SOL"] = solBalanceInSol;
    }

    // Get all token accounts for the provided address
    const accounts = await this.connection.getTokenAccountsByOwner(
      publicKey,
      { programId: TOKEN_PROGRAM_ID }
    );

    // Fetch the token list and create lookup map
    const tokenList = await this.getTokenList();
    const tokenDefs = tokenList.reduce((acc, token) => {
      if (!upperCaseSymbols || upperCaseSymbols.includes(token.symbol.toUpperCase())) {
        acc[token.address] = { symbol: token.symbol, decimals: token.decimals };
      }
      return acc;
    }, {});

    // Process token accounts
    for (const value of accounts.value) {
      const parsedTokenAccount = unpackAccount(value.pubkey, value.account);
      const mint = parsedTokenAccount.mint;
      const tokenDef = tokenDefs[mint.toBase58()];
      if (tokenDef === undefined) continue;

      const amount = parsedTokenAccount.amount;
      const uiAmount = Number(amount) / Math.pow(10, tokenDef.decimals);
      balances[tokenDef.symbol] = uiAmount;
    }

    return balances;
  }

  async getBalances(wallet: Keypair): Promise<Record<string, TokenValue>> {
    let balances: Record<string, TokenValue> = {};

    balances['UNWRAPPED_SOL'] = await this.getSolBalance(wallet);

    const allSplTokens = await this.connection.getParsedTokenAccountsByOwner(
      wallet.publicKey, 
      { programId: TOKEN_PROGRAM_ADDRESS }
    );

    for (const tokenAccount of allSplTokens.value) {
      const tokenInfo = tokenAccount.account.data.parsed['info'];
      const mintAddress = tokenInfo['mint'];
      const token = this.tokenList.find(t => t.address === mintAddress);
      if (token?.symbol) {
        balances[token.symbol] = this.tokenResponseToTokenValue(
          tokenInfo['tokenAmount']
        );
      }
    }

    let allSolBalance = BigNumber.from(0);
    let allSolDecimals = 9; // Solana's default decimals

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
        decimals: allSolDecimals,
      };
    }

    balances['ALL_SOL'] = {
      value: allSolBalance,
      decimals: allSolDecimals,
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
    const lamports = await this.connection.getBalance(wallet.publicKey);
    return { value: BigNumber.from(lamports), decimals: 9 };
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
    const response = await this.connection.getParsedTokenAccountsByOwner(
      walletAddress,
      { mint: mintAddress }
    );
    if (response['value'].length == 0) {
      throw new Error(`Token account not initialized`);
    }
    return this.tokenResponseToTokenValue(
      response.value[0].account.data.parsed['info']['tokenAmount']
    );
  }

  // returns a Solana TransactionResponse for a txHash.
  async getTransaction(
    payerSignature: string
  ): Promise<VersionedTransactionResponse | null> {
    return this.connection.getTransaction(
      payerSignature,
      {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      }
    );
  }

  // returns a Solana TransactionResponseStatusCode for a txData.
  public async getTransactionStatusCode(
    txData: TransactionResponse | null
  ): Promise<TransactionResponseStatusCode> {
    let txStatus;
    if (!txData) {
        // tx not yet confirmed by validator
        txStatus = TransactionResponseStatusCode.UNCONFIRMED;
    } else {
        // If txData exists, check if there's an error in the metadata
        txStatus =
            txData.meta?.err == null
                ? TransactionResponseStatusCode.CONFIRMED
                : TransactionResponseStatusCode.FAILED;
    }
    return txStatus;
  }

  // returns the current block number
  async getCurrentBlockNumber(): Promise<number> {
    return await this.connection.getSlot('processed');
  }

  async close() {
    if (this.network in Solana._instances) {
      delete Solana._instances[this.network];
    }
  }

  public async getGasPrice(): Promise<number> {
    const priorityFeeInMicroLamports = await this.estimatePriorityFees();
    
    // Calculate priority fee in lamports
    const priorityFeeLamports = Math.floor(
      (this.config.defaultComputeUnits * priorityFeeInMicroLamports) / 1_000_000
    );
    
    // Add base fee and convert to SOL using LAMPORT_TO_SOL constant
    const gasCost = (BASE_FEE + priorityFeeLamports) * LAMPORT_TO_SOL;

    return gasCost;
  }
  
  async estimatePriorityFees(): Promise<number> {
    // Check cache first
    if (
      Solana.lastPriorityFeeEstimate && 
      Date.now() - Solana.lastPriorityFeeEstimate.timestamp < Solana.PRIORITY_FEE_CACHE_MS
    ) {
      return Solana.lastPriorityFeeEstimate.fee;
    }

    try {
      const params: string[][] = [];
      params.push(PRIORITY_FEE_ACCOUNTS);
      const payload = {
        method: 'getRecentPrioritizationFees',
        params: params,
        id: 1,
        jsonrpc: '2.0',
      };

      const response = await fetch(this.connection.rpcEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fees: ${response.status}`);
      }

      const data: PriorityFeeResponse = await response.json();

      // Extract fees and filter out zeros
      const fees = data.result
        .map((item) => item.prioritizationFee)
        .filter((fee) => fee > 0);

      // minimum fee is the minimum fee per compute unit
      const minimumFee = this.config.minPriorityFee / this.config.defaultComputeUnits * 1_000_000;

      if (fees.length === 0) {
        return minimumFee;
      }

      // Sort fees in ascending order for percentile calculation
      fees.sort((a, b) => a - b);
      
      // Calculate statistics
      const minFee = Math.min(...fees);
      const maxFee = Math.max(...fees);
      const averageFee = Math.floor(
        fees.reduce((sum, fee) => sum + fee, 0) / fees.length
      );

      logger.info(`[PRIORITY FEES] Range: ${minFee} - ${maxFee} microLamports (avg: ${averageFee})`);

      // Calculate index for percentile
      const percentileIndex = Math.ceil(fees.length * this.config.priorityFeePercentile);
      let percentileFee = fees[percentileIndex - 1];  // -1 because array is 0-based
      
      // Ensure fee is not below minimum
      percentileFee = Math.max(percentileFee, minimumFee);
      
      logger.info(`[PRIORITY FEES] Used: ${percentileFee} microLamports`);

      // Cache the result
      Solana.lastPriorityFeeEstimate = {
        timestamp: Date.now(),
        fee: percentileFee,
      };

      return percentileFee;

    } catch (error: any) {
      throw new Error(`Failed to fetch priority fees: ${error.message}`);
    }
  }

  public async confirmTransaction(
    signature: string,
    timeout: number = 3000,
  ): Promise<{ confirmed: boolean; txData?: any }> {
    try {
      const confirmationPromise = new Promise<{ confirmed: boolean; txData?: any }>(async (resolve, reject) => {
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

        const response = await fetch(this.connection.rpcEndpoint, {
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
          const status = data.result.value[0];
          
          if (status.err !== null) {
            reject(new Error(`Transaction failed with error: ${JSON.stringify(status.err)}`));
            return;
          }
          
          const isConfirmed =
            status.confirmationStatus === 'confirmed' || 
            status.confirmationStatus === 'finalized';

          if (isConfirmed) {
            // Fetch transaction data if confirmed
            const txData = await this.connection.getParsedTransaction(signature, {
              maxSupportedTransactionVersion: 0,
            });
            resolve({ confirmed: true, txData });
          } else {
            resolve({ confirmed: false });
          }
        } else {
          resolve({ confirmed: false });
        }
      });

      const timeoutPromise = new Promise<{ confirmed: boolean }>((_, reject) =>
        setTimeout(() => reject(new Error('Confirmation timed out')), timeout),
      );

      return await Promise.race([confirmationPromise, timeoutPromise]);
    } catch (error: any) {
      throw new Error(`Failed to confirm transaction: ${error.message}`);
    }
  }

  async sendAndConfirmTransaction(
    tx: Transaction, 
    signers: Signer[] = [],
    computeUnits?: number
  ): Promise<string> {
    let currentPriorityFee = await this.estimatePriorityFees();
    
    while (currentPriorityFee <= this.config.maxPriorityFee) {
      // Only add compute unit limit instruction if explicitly provided
      if (computeUnits) {
        const computeUnitLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnits,
        });
        tx.add(computeUnitLimitInstruction);
      }

      // Set priority fee instruction
      const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor(currentPriorityFee),
      });

      tx.instructions.push(priorityFeeInstruction);      

      // Get latest blockhash
      const blockhashAndContext = await this.connection
        .getLatestBlockhashAndContext('confirmed');
      
      const lastValidBlockHeight = blockhashAndContext.value.lastValidBlockHeight;
      const blockhash = blockhashAndContext.value.blockhash;

      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.recentBlockhash = blockhash;
      tx.sign(...signers);

      let retryCount = 0;
      while (retryCount < this.config.retryCount) {
        try {
          const signature = await this.sendRawTransaction(
            tx.serialize(),
            lastValidBlockHeight,
          );

          // Wait for confirmation
          const confirmed = await this.confirmTransaction(signature);
          if (confirmed) {
            logger.info(`Transaction confirmed with priority fee: ${currentPriorityFee} microLamports`);
            return signature;
          }

          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.config.retryIntervalMs));
        } catch (error) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.config.retryIntervalMs));
        }
      }

      // If we get here, transaction wasn't confirmed after RETRY_COUNT attempts
      // Increase the priority fee and try again
      currentPriorityFee = Math.floor(currentPriorityFee * this.config.priorityFeeMultiplier);
      logger.info(`Increasing priority fee to ${currentPriorityFee} microLamports`);
    }

    throw new Error(`Transaction failed after reaching maximum priority fee of ${this.config.maxPriorityFee} microLamports`);
  }

  async sendRawTransaction(
    rawTx: Buffer | Uint8Array | Array<number>,
    lastValidBlockHeight: number,
  ): Promise<string> {
    let blockheight = await this.connection
      .getBlockHeight({ commitment: 'confirmed' });

    let signatures: string[];
    let retryCount = 0;

    while (blockheight <= lastValidBlockHeight + 50) {
      try {
        const sendRawTransactionResults = await Promise.allSettled([
          this.connection.sendRawTransaction(rawTx, {
            skipPreflight: true,
            preflightCommitment: 'confirmed',
            maxRetries: 0,
          })
        ]);

      const successfulResults = sendRawTransactionResults.filter(
        (result) => result.status === 'fulfilled',
      );

      if (successfulResults.length > 0) {
        // Map all successful results to get their values (signatures)
        signatures = successfulResults
          .map((result) => (result.status === 'fulfilled' ? result.value : ''))
          .filter(sig => sig !== ''); // Filter out empty strings

          // Verify all signatures match
          if (!signatures.every((sig) => sig === signatures[0])) {
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, this.config.retryIntervalMs));
            continue;
          }

          return signatures[0];
        }

        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, this.config.retryIntervalMs));
      } catch (error) {
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, this.config.retryIntervalMs));
      }
    }

    // If we exit the while loop without returning, we've exceeded block height
    throw new Error('Maximum blockheight exceeded');
  }

  async extractTokenBalanceChangeAndFee(
    signature: string,
    mint: string,
    owner: string,
  ): Promise<{ balanceChange: number; fee: number }> {
    let txDetails;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        txDetails = await this.connection.getParsedTransaction(signature, {
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
        txDetails = await this.connection.getParsedTransaction(signature, {
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
          return { balanceChange: 0, fee: 0 };
        }
      }
    }

    const preBalances = txDetails.meta?.preBalances || [];
    const postBalances = txDetails.meta?.postBalances || [];

    const balanceChange =
      Math.abs(postBalances[accountIndex] - preBalances[accountIndex]) * LAMPORT_TO_SOL;
    const fee = (txDetails.meta?.fee || 0) * LAMPORT_TO_SOL;

    return { balanceChange, fee };
  }

  // Validate if a string is a valid Solana private key
  public static validateSolPrivateKey(secretKey: string): boolean {
    try {
      const secretKeyBytes = bs58.decode(secretKey);
      Keypair.fromSecretKey(new Uint8Array(secretKeyBytes));
      return true;
    } catch (error) {
      return false;
    }
  }

}

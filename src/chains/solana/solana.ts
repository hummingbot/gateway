import crypto from 'crypto';
import bs58 from 'bs58';
import fse from 'fs-extra';
import { TokenListType } from '../../services/base';
import { HttpException, SIMULATION_ERROR_MESSAGE, SIMULATION_ERROR_CODE } from '../../services/error-handler';
import { TokenInfo } from '@solana/spl-token-registry';
import {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  MessageV0,
  Signer,
  Transaction,
  TransactionResponse,
  VersionedTransaction,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, unpackAccount, getMint } from "@solana/spl-token";

import { walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { TokenListResolutionStrategy } from '../../services/token-list-resolution';
import { Config, getSolanaConfig } from './solana.config';
import { SolanaController } from './solana.controllers';

// Constants used for fee calculations
export const BASE_FEE = 5000;
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

  async getToken(addressOrSymbol: string): Promise<TokenInfo | null> {
    // First try to find by symbol (case-insensitive)
    const normalizedSearch = addressOrSymbol.toUpperCase().trim();
    let token = this.tokenList.find(
      (token: TokenInfo) => token.symbol.toUpperCase().trim() === normalizedSearch
    );

    // If not found by symbol, try to find by address
    if (!token) {
      token = this.tokenList.find(
        (token: TokenInfo) => token.address.toLowerCase() === addressOrSymbol.toLowerCase()
      );
    }

    // If still not found, try to create a new token assuming addressOrSymbol is an address
    if (!token) {
      try {
        // Validate if it's a valid public key
        const mintPubkey = new PublicKey(addressOrSymbol);
        
        // Fetch mint info to get decimals
        const mintInfo = await getMint(this.connection, mintPubkey);
        
        // Create a basic token object with fetched decimals
        token = {
          address: addressOrSymbol,
          symbol: `DUMMY_${addressOrSymbol.slice(0, 4)}`,
          name: `Dummy Token (${addressOrSymbol.slice(0, 8)}...)`,
          decimals: mintInfo.decimals,
          chainId: 101,
        };
      } catch (e) {
        // Not a valid public key or couldn't fetch mint info, return null
        return null;
      }
    }

    return token;
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
    const publicKey = wallet.publicKey;
    let balances: Record<string, number> = {};

    // Fetch SOL balance only if symbols is undefined or includes "SOL" (case-insensitive)
    if (!symbols || symbols.some(s => s.toUpperCase() === "SOL")) {
      const solBalance = await this.connection.getBalance(publicKey);
      const solBalanceInSol = solBalance * LAMPORT_TO_SOL;
      balances["SOL"] = solBalanceInSol;
    }

    // Get all token accounts for the provided address
    const accounts = await this.connection.getTokenAccountsByOwner(
      publicKey,
      { programId: TOKEN_PROGRAM_ID }
    );

    // Process token accounts
    for (const value of accounts.value) {
      const parsedTokenAccount = unpackAccount(value.pubkey, value.account);
      const mintAddress = parsedTokenAccount.mint.toBase58();
      
      // Only check tokens from our token list when no symbols are specified
      const token = this.tokenList.find(t => t.address === mintAddress);
      
      if (token && (!symbols || symbols.some(s => 
        s.toUpperCase() === token.symbol.toUpperCase() || 
        s.toLowerCase() === mintAddress.toLowerCase()
      ))) {
        const amount = parsedTokenAccount.amount;
        const uiAmount = Number(amount) / Math.pow(10, token.decimals);
        balances[token.symbol] = uiAmount;
      }
    }

    return balances;
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
    const priorityFeePerCU = await this.estimatePriorityFees();
    
    // Calculate total priority fee in lamports (priorityFeePerCU is already in lamports/CU)
    const priorityFee = this.config.defaultComputeUnits * priorityFeePerCU;
    
    // Add base fee (in lamports) and convert total to SOL
    const totalLamports = BASE_FEE + priorityFee;
    const gasCost = totalLamports * LAMPORT_TO_SOL;

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
        logger.error(`Failed to fetch priority fees, using minimum fee: ${response.status}`);
        return this.config.minPriorityFee * 1_000_000 / this.config.defaultComputeUnits;
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
      const minFee = Math.min(...fees) / 1_000_000; // Convert to lamports
      const maxFee = Math.max(...fees) / 1_000_000; // Convert to lamports
      const averageFee = fees.reduce((sum, fee) => sum + fee, 0) / fees.length / 1_000_000 // Convert to lamports
      logger.info(`Recent priority fees paid: ${minFee.toFixed(4)} - ${maxFee.toFixed(4)} lamports/CU (avg: ${averageFee.toFixed(4)})`);

      // Calculate index for percentile
      const percentileIndex = Math.ceil(fees.length * this.config.basePriorityFeePct / 100);
      let basePriorityFee = fees[percentileIndex - 1] / 1_000_000;  // Convert to lamports
      
      // Ensure fee is not below minimum (convert SOL to lamports)
      const minimumFeeLamports = Math.floor(this.config.minPriorityFee * 1e9 / this.config.defaultComputeUnits);
      basePriorityFee = Math.max(basePriorityFee, minimumFeeLamports);
      
      logger.info(`Base priority fee: ${basePriorityFee.toFixed(4)} lamports/CU (${basePriorityFee === minimumFeeLamports ? 'minimum' : `${this.config.basePriorityFeePct}th percentile`})`);

      // Cache the result
      Solana.lastPriorityFeeEstimate = {
        timestamp: Date.now(),
        fee: basePriorityFee,
      };

      return basePriorityFee;

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
        // Use getTransaction instead of getSignatureStatuses for more reliability
        const txData = await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });

        if (!txData) {
          return resolve({ confirmed: false });
        }

        // Check if transaction is already confirmed but had an error
        if (txData.meta?.err) {
          return reject(new Error(
            `Transaction failed with error: ${JSON.stringify(txData.meta.err)}`
          ));
        }

        // More definitive check using slot confirmation
        const status = await this.connection.getSignatureStatus(signature);
        const isConfirmed = status.value?.confirmationStatus === 'confirmed' || 
                          status.value?.confirmationStatus === 'finalized';

        resolve({ confirmed: !!isConfirmed, txData });
      });

      const timeoutPromise = new Promise<{ confirmed: boolean }>((_, reject) =>
        setTimeout(() => reject(new Error('Confirmation timed out')), timeout),
      );

      return await Promise.race([confirmationPromise, timeoutPromise]);
    } catch (error: any) {
      throw new Error(`Failed to confirm transaction: ${error.message}`);
    }
  }

  private getFee(txData: any): number {
    if (!txData?.meta) {
      return 0;
    }
    // Convert fee from lamports to SOL
    return (txData.meta.fee || 0) * LAMPORT_TO_SOL;
  }

  public async sendAndConfirmTransaction(
    tx: Transaction | VersionedTransaction, 
    signers: Signer[] = [],
    computeUnits?: number
  ): Promise<{ signature: string; fee: number }> {
    let currentPriorityFee = await this.estimatePriorityFees();
    const computeUnitsToUse = computeUnits || this.config.defaultComputeUnits;
    
    while (true) {
      const basePriorityFeeLamports = currentPriorityFee * computeUnitsToUse;
      
      logger.info(`Sending transaction with max priority fee of ${(basePriorityFeeLamports * LAMPORT_TO_SOL).toFixed(6)} SOL`);
      
      // Check if we've exceeded max fee (convert maxPriorityFee from SOL to lamports)
      if (basePriorityFeeLamports > this.config.maxPriorityFee * 1e9) {
        throw new Error(`Exceeded maximum priority fee of ${this.config.maxPriorityFee} SOL`);
      }

      if (tx instanceof Transaction) {
        tx = await this.prepareTx(
          tx,
          currentPriorityFee,
          computeUnitsToUse,
          signers
        );
      } else {
        tx = await this.prepareVersionedTx(
          tx,
          currentPriorityFee,
          computeUnitsToUse,
          signers
        );
      }

      let retryCount = 0;
      while (retryCount < this.config.retryCount) {
        try {
          const signature = await this.sendRawTransaction(
            'message' in tx ? tx.serialize() : tx.serialize(),
            'lastValidBlockHeight' in tx ? tx.lastValidBlockHeight : undefined,
          );

          // Modified confirmation handling
          try {
            const confirmed = await this.confirmTransaction(signature);
            logger.info(`[${retryCount + 1}/${this.config.retryCount}] Transaction ${signature} confirmation status: `, confirmed);
            if (confirmed.confirmed) {
              const actualFee = this.getFee(confirmed.txData);
              logger.info(`Transaction ${signature} confirmed with total fee: ${actualFee.toFixed(6)} SOL`);
              return { signature, fee: actualFee };
            }
          } catch (error) {
            // If transaction failed, break out of retry loop immediately
            if (error.message.includes('Transaction failed')) {
              throw error;
            }
            // Otherwise continue to retry
          }

          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.config.retryIntervalMs));
        } catch (error) {
          // Only retry if error is not a definitive failure
          if (error.message.includes('Transaction failed')) {
            throw error;
          }
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.config.retryIntervalMs));
        }
      }

      // If we get here, transaction wasn't confirmed after RETRY_COUNT attempts
      // Increase the priority fee and try again
      currentPriorityFee = currentPriorityFee * this.config.priorityFeeMultiplier;
      logger.info(`Increasing max priority fee to ${(currentPriorityFee * computeUnitsToUse * LAMPORT_TO_SOL).toFixed(6)} SOL`);
    }
  }

  private async prepareTx(
    tx: Transaction,
    currentPriorityFee: number,
    computeUnitsToUse: number,
    signers: Signer[]
  ): Promise<Transaction> {
    // Add priority fee instruction (converting to microLamports)
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: currentPriorityFee * 1_000_000,
    });
  
    // Remove any existing priority fee instructions and add the new one
    tx.instructions = [
      ...tx.instructions.filter(inst => !inst.programId.equals(ComputeBudgetProgram.programId)),
      priorityFeeInstruction
    ];
  
    // Set compute unit limit
    const computeUnitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnitsToUse
    });
    tx.add(computeUnitInstruction);
  
    // Get latest blockhash
    const { value: { lastValidBlockHeight, blockhash } } = 
      await this.connection.getLatestBlockhashAndContext('confirmed');
    
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);
  
    return tx;
  }

  private async prepareVersionedTx(
    tx: VersionedTransaction,
    currentPriorityFee: number,
    computeUnits: number,
    _signers: Signer[]
  ): Promise<VersionedTransaction> {
    const originalMessage = tx.message;
    const originalStaticCount = originalMessage.staticAccountKeys.length;
    const originalSignatures = tx.signatures; // Clone original signatures array

    let modifiedTx: VersionedTransaction;

    // Create new compute budget instructions
    const computeBudgetInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: currentPriorityFee * 1_000_000 })
    ];

    console.log('priority fee in lamports:', currentPriorityFee);

    // Check if ComputeBudgetProgram is in static keys
    const computeBudgetProgramIndex = originalMessage.staticAccountKeys.findIndex(
      key => key.equals(ComputeBudgetProgram.programId)
    );

    // Add ComputeBudget program to static keys, adjust indexes, and create modified instructions
    if (computeBudgetProgramIndex === -1) {

      // Add ComputeBudget program to static keys
      const newStaticKeys = [
        ...originalMessage.staticAccountKeys,
        ComputeBudgetProgram.programId,
      ];

      // Process original instructions with index adjustment
      const originalInstructions = originalMessage.compiledInstructions.map(ix => ({
        ...ix,
        accountKeyIndexes: ix.accountKeyIndexes.map(index => 
          index >= originalStaticCount ? index + 1 : index
        )
      }));

      // Create modified instructions
      const modifiedInstructions = [
        ...computeBudgetInstructions.map(ix => ({
          programIdIndex: newStaticKeys.indexOf(ComputeBudgetProgram.programId), // Use new index
          accountKeyIndexes: [],
          data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data
        })),
        ...originalInstructions
      ];

      // Build new transaction
      modifiedTx = new VersionedTransaction(
      new MessageV0({
        header: originalMessage.header,
        staticAccountKeys: newStaticKeys,
        recentBlockhash: originalMessage.recentBlockhash!,
        compiledInstructions: modifiedInstructions.map(ix => ({
          programIdIndex: ix.programIdIndex,
          accountKeyIndexes: ix.accountKeyIndexes,
          data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data
        })),
        addressTableLookups: originalMessage.addressTableLookups
      })
    );

    } else {
      // Remove compute budget instructions from original instructions
      const nonComputeBudgetInstructions = originalMessage.compiledInstructions.filter(ix => 
        !originalMessage.staticAccountKeys[ix.programIdIndex].equals(ComputeBudgetProgram.programId)
      );

      // Create modified instructions
      const modifiedInstructions = [
        ...computeBudgetInstructions.map(ix => ({
          programIdIndex: computeBudgetProgramIndex, // Use existing index if already present
          accountKeyIndexes: [],
          data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data
        })),
        ...nonComputeBudgetInstructions
      ];
      // Build new transaction with same keys but modified instructions
      modifiedTx = new VersionedTransaction(
        new MessageV0({
          header: originalMessage.header,
          staticAccountKeys: originalMessage.staticAccountKeys,
          recentBlockhash: originalMessage.recentBlockhash,
          compiledInstructions: modifiedInstructions.map(ix => ({
            programIdIndex: ix.programIdIndex,
            accountKeyIndexes: ix.accountKeyIndexes,
            data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data
          })),
          addressTableLookups: originalMessage.addressTableLookups
        })
      );
    }
    // DON'T DELETE COMMENTS BELOW
    // console.log('Original message:', JSON.stringify({
    //   message: {
    //     header: originalMessage.header,
    //     staticAccountKeys: originalMessage.staticAccountKeys.map(k => k.toBase58()),
    //     recentBlockhash: originalMessage.recentBlockhash,
    //     compiledInstructions: originalMessage.compiledInstructions.map(ix => ({
    //       programIdIndex: ix.programIdIndex,
    //       accountKeyIndexes: ix.accountKeyIndexes,
    //       data: bs58.encode(ix.data)
    //     })),
    //     addressTableLookups: originalMessage.addressTableLookups
    //   }
    // }, null, 2));    
    // console.log('Modified transaction:', JSON.stringify({
    //   message: {
    //     header: modifiedTx.message.header,
    //     staticAccountKeys: modifiedTx.message.staticAccountKeys.map(k => k.toBase58()),
    //     recentBlockhash: modifiedTx.message.recentBlockhash,
    //     compiledInstructions: modifiedTx.message.compiledInstructions.map(ix => ({
    //       programIdIndex: ix.programIdIndex,
    //       accountKeyIndexes: ix.accountKeyIndexes,
    //       data: bs58.encode(ix.data)
    //     })),
    //     addressTableLookups: modifiedTx.message.addressTableLookups
    //   }
    // }, null, 2));

    modifiedTx.signatures = originalSignatures;
    modifiedTx.sign([..._signers]);
    console.log('modifiedTx:', modifiedTx);
    
    return modifiedTx;
  }

  async sendAndConfirmRawTransaction(
    transaction: VersionedTransaction
  ): Promise<{ confirmed: boolean, signature?: string, txData?: any }> {
    let retryCount = 0;
    while (retryCount < this.config.retryCount) {
      const signature = await this.connection.sendRawTransaction(
        Buffer.from(transaction.serialize()),
        { skipPreflight: true }
      );
      const { confirmed, txData } = await this.confirmTransaction(signature);
      logger.info(`[${retryCount + 1}/${this.config.retryCount}] Transaction ${signature} status: ${confirmed ? 'confirmed' : 'unconfirmed'}`);
      if (confirmed && txData) {
        return { confirmed, signature, txData };  
      }
      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, this.config.retryIntervalMs));
    }
    return { confirmed: false };
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

  // Add new method to get first wallet address
  public async getFirstWalletAddress(): Promise<string | null> {
    const path = `${walletPath}/solana`;
    try {
      // Create directory if it doesn't exist
      await fse.ensureDir(path);
      
      // Get all .json files in the directory
      const files = await fse.readdir(path);
      const walletFiles = files.filter(f => f.endsWith('.json'));
      
      if (walletFiles.length === 0) {
        return null;
      }
      
      // Return first wallet address (without .json extension)
      return walletFiles[0].slice(0, -5);
    } catch (error) {
      return null;
    }
  }

  // Update getTokenBySymbol to use new getToken method
  public async getTokenBySymbol(tokenSymbol: string): Promise<TokenInfo | undefined> {
    return (await this.getToken(tokenSymbol)) || undefined;
  }

  /**
   * Helper function to get balance changes for both tokens in a pair
   * @param signature Transaction signature
   * @param tokenX First token (can be SOL)
   * @param tokenY Second token (can be SOL)
   * @param walletAddress Wallet address to check balances for
   * @returns Balance changes and transaction fee
   */
  async extractPairBalanceChangesAndFee(
    signature: string,
    tokenX: TokenInfo,
    tokenY: TokenInfo,
    walletAddress: string,
  ): Promise<{ 
    baseTokenBalanceChange: number; 
    quoteTokenBalanceChange: number;
    fee: number;
  }> {
    let baseTokenBalanceChange: number, quoteTokenBalanceChange: number;

    if (tokenX.symbol === 'SOL') {
      ({ balanceChange: baseTokenBalanceChange } = await this.extractAccountBalanceChangeAndFee(signature, 0));
    } else {
      ({ balanceChange: baseTokenBalanceChange } = await this.extractTokenBalanceChangeAndFee(
        signature,
        tokenX.address,
        walletAddress
      ));
    }

    if (tokenY.symbol === 'SOL') {
      ({ balanceChange: quoteTokenBalanceChange } = await this.extractAccountBalanceChangeAndFee(signature, 0));
    } else {
      ({ balanceChange: quoteTokenBalanceChange } = await this.extractTokenBalanceChangeAndFee(
        signature,
        tokenY.address,
        walletAddress
      ));
    }

    const { fee } = await this.extractAccountBalanceChangeAndFee(signature, 0);

    return {
      baseTokenBalanceChange: Math.abs(baseTokenBalanceChange),
      quoteTokenBalanceChange: Math.abs(quoteTokenBalanceChange),
      fee,
    };
  }

  public async simulateTransaction(transaction: VersionedTransaction) {
    const { value: simulatedTransactionResponse } = await this.connection.simulateTransaction(
      transaction,
      {
        replaceRecentBlockhash: true,
        commitment: 'confirmed',
        accounts: { encoding: 'base64', addresses: [] },
        sigVerify: false,
      },
    );
    
    logger.info('Simulation Result:', {
      // logs: simulatedTransactionResponse.logs,
      unitsConsumed: simulatedTransactionResponse.unitsConsumed,
      status: simulatedTransactionResponse.err ? 'FAILED' : 'SUCCESS'
    });

    if (simulatedTransactionResponse.err) {
      const logs = simulatedTransactionResponse.logs || [];
      const errorMessage = `${SIMULATION_ERROR_MESSAGE}\nError: ${JSON.stringify(simulatedTransactionResponse.err)}\nProgram Logs: ${logs.join('\n')}`;
      
      throw new HttpException(
        503,
        errorMessage,
        SIMULATION_ERROR_CODE
      );
    }
  }

  public async sendAndConfirmVersionedTransaction(
    tx: VersionedTransaction, 
    signers: Signer[] = [],
    computeUnits?: number
  ): Promise<{ signature: string; fee: number }> {
    let currentPriorityFee = await this.estimatePriorityFees();
    const computeUnitsToUse = computeUnits || this.config.defaultComputeUnits;
    
    while (true) {
      const basePriorityFeeLamports = Math.floor(currentPriorityFee * computeUnitsToUse);
      
      logger.info(`Sending transaction with max priority fee of ${(basePriorityFeeLamports * LAMPORT_TO_SOL).toFixed(6)} SOL`);
      
      // Check if we've exceeded max fee (convert maxPriorityFee from SOL to lamports)
      if (basePriorityFeeLamports > this.config.maxPriorityFee * 1e9) {
        throw new Error(`Exceeded maximum priority fee of ${this.config.maxPriorityFee} SOL`);
      }

      // Prepare transaction with compute budget instructions
      const modifiedTx = await this.prepareVersionedTx(
        tx,
        currentPriorityFee,
        computeUnitsToUse,
        signers
      );

      // Simulate transaction
      await this.simulateTransaction(modifiedTx);

      let retryCount = 0;
      while (retryCount < this.config.retryCount) {
        try {
          const signature = await this.connection.sendRawTransaction(
            Buffer.from(modifiedTx.serialize()),
            { skipPreflight: true }
          );

          try {
            const confirmed = await this.confirmTransaction(signature);
            logger.info(`[${retryCount + 1}/${this.config.retryCount}] Transaction ${signature} status: ${confirmed ? 'confirmed' : 'unconfirmed'}`);
            if (confirmed && confirmed.txData) {
              const actualFee = this.getFee(confirmed.txData);
              logger.info(`Transaction ${signature} confirmed with total fee: ${actualFee.toFixed(6)} SOL`);
              return { signature, fee: actualFee };
            }
          } catch (error) {
            // If transaction failed, break out of retry loop immediately
            if (error.message.includes('Transaction failed')) {
              throw error;
            }
            // Otherwise continue to retry
          }

          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.config.retryIntervalMs));
        } catch (error) {
          // Only retry if error is not a definitive failure
          if (error.message.includes('Transaction failed')) {
            throw error;
          }
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, this.config.retryIntervalMs));
        }
      }

      // If we get here, transaction wasn't confirmed after RETRY_COUNT attempts
      // Increase the priority fee and try again
      currentPriorityFee = currentPriorityFee * this.config.priorityFeeMultiplier;
      logger.info(`Increasing max priority fee to ${(currentPriorityFee * computeUnitsToUse * LAMPORT_TO_SOL).toFixed(6)} SOL`);
    }
  }

}

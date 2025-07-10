import crypto from 'crypto';

import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  getMint,
} from '@solana/spl-token';
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
import bs58 from 'bs58';
import fse from 'fs-extra';

import { TokenListType } from '../../services/base';

// TODO: Replace with Fastify httpErrors
const SIMULATION_ERROR_MESSAGE = 'Transaction simulation failed: ';

import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import {
  walletPath,
  getSafeWalletFilePath,
  sanitizePathComponent,
  getReadOnlyWalletAddresses,
} from '../../wallet/utils';

import { Config, getSolanaConfig } from './solana.config';

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
  private static _walletAddressExample: string | null = null;

  private static lastPriorityFeeEstimate: {
    timestamp: number;
    fee: number;
  } | null = null;
  private static PRIORITY_FEE_CACHE_MS = 10000; // 10 second cache

  private constructor(network: string) {
    this.network = network;
    this.config = getSolanaConfig('solana', network);
    this.nativeTokenSymbol = this.config.network.nativeCurrencySymbol;
    this.connection = new Connection(this.config.network.nodeURL, {
      commitment: 'confirmed',
    });
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
      logger.info(
        `Initializing Solana connector for network: ${this.network}, nodeURL: ${this.config.network.nodeURL}`,
      );
      await this.loadTokens(
        this.config.network.tokenListSource,
        this.config.network.tokenListType,
      );
    } catch (e) {
      logger.error(`Failed to initialize ${this.network}: ${e}`);
      throw e;
    }
  }

  async getTokenList(
    _tokenListSource?: string,
    _tokenListType?: TokenListType,
  ): Promise<TokenInfo[]> {
    // Always return the stored list loaded via TokenService
    return this.tokenList;
  }

  async loadTokens(
    _tokenListSource: string,
    _tokenListType: TokenListType,
  ): Promise<void> {
    try {
      // Use TokenService to load tokens
      const tokens = await TokenService.getInstance().loadTokenList(
        'solana',
        this.network,
      );

      // Convert to TokenInfo format (SPL token registry format)
      this.tokenList = tokens.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        chainId: 101, // Solana mainnet chainId
      }));

      // Create symbol -> token mapping
      this.tokenList.forEach((token: TokenInfo) => {
        this._tokenMap[token.symbol] = token;
      });

      logger.info(
        `Loaded ${this.tokenList.length} tokens for solana/${this.network}`,
      );
    } catch (error) {
      logger.error(
        `Failed to load token list for ${this.network}: ${error.message}`,
      );
      throw error;
    }
  }

  async getToken(addressOrSymbol: string): Promise<TokenInfo | null> {
    // First try to find by symbol (case-insensitive)
    const normalizedSearch = addressOrSymbol.toUpperCase().trim();
    let token = this.tokenList.find(
      (token: TokenInfo) =>
        token.symbol.toUpperCase().trim() === normalizedSearch,
    );

    // If not found by symbol, try to find by address
    if (!token) {
      token = this.tokenList.find(
        (token: TokenInfo) =>
          token.address.toLowerCase() === addressOrSymbol.toLowerCase(),
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

  /**
   * Validate Solana address format
   * @param address The address to validate
   * @returns The address if valid
   * @throws Error if the address is invalid
   */
  public static validateAddress(address: string): string {
    try {
      // Check if address can be parsed as a public key
      new PublicKey(address);

      // Additional check for proper length
      if (address.length < 32 || address.length > 44) {
        throw new Error('Invalid address length');
      }

      return address;
    } catch (error) {
      throw new Error(`Invalid Solana address format: ${address}`);
    }
  }

  async getWallet(address: string): Promise<Keypair> {
    try {
      // Validate the address format first
      const validatedAddress = Solana.validateAddress(address);

      // Use the safe wallet file path utility to prevent path injection
      const safeWalletPath = getSafeWalletFilePath('solana', validatedAddress);

      // Read the wallet file using the safe path
      const encryptedPrivateKey: string = await fse.readFile(
        safeWalletPath,
        'utf8',
      );

      const passphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!passphrase) {
        throw new Error('missing passphrase');
      }
      const decrypted = await this.decrypt(encryptedPrivateKey, passphrase);

      return Keypair.fromSecretKey(new Uint8Array(bs58.decode(decrypted)));
    } catch (error) {
      if (error.message.includes('Invalid Solana address')) {
        throw error; // Re-throw validation errors
      }
      if (error.code === 'ENOENT') {
        throw new Error(`Wallet not found for address: ${address}`);
      }
      throw error;
    }
  }

  /**
   * Check if an address is a read-only wallet
   */
  async isReadOnlyWallet(address: string): Promise<boolean> {
    try {
      const readOnlyAddresses = await getReadOnlyWalletAddresses('solana');
      return readOnlyAddresses.includes(address);
    } catch (error) {
      logger.error(`Error checking read-only wallet status: ${error.message}`);
      return false;
    }
  }

  async encrypt(secret: string, password: string): Promise<string> {
    const algorithm = 'aes-256-ctr';
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(
      password,
      new Uint8Array(salt),
      5000,
      32,
      'sha512',
    );
    const cipher = crypto.createCipheriv(
      algorithm,
      new Uint8Array(key),
      new Uint8Array(iv),
    );

    const encryptedBuffers = [
      new Uint8Array(cipher.update(new Uint8Array(Buffer.from(secret)))),
      new Uint8Array(cipher.final()),
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
      iv,
    );

    const decryptedBuffers = [
      new Uint8Array(
        decipher.update(new Uint8Array(Buffer.from(hash.encrypted, 'hex'))),
      ),
      new Uint8Array(decipher.final()),
    ];
    const decrypted = Buffer.concat(decryptedBuffers);

    return decrypted.toString();
  }

  /**
   * @deprecated Use the optimized implementation in routes/balances.ts instead
   */
  async getBalance(
    wallet: Keypair,
    symbols?: string[],
  ): Promise<Record<string, number>> {
    const publicKey = wallet.publicKey;
    const balances: Record<string, number> = {};

    // Treat empty array as if no tokens were specified
    const effectiveSymbols =
      symbols && symbols.length === 0 ? undefined : symbols;

    // Fetch SOL balance only if symbols is undefined or includes "SOL" (case-insensitive)
    if (
      !effectiveSymbols ||
      effectiveSymbols.some((s) => s.toUpperCase() === 'SOL')
    ) {
      const solBalance = await this.connection.getBalance(publicKey);
      const solBalanceInSol = solBalance * LAMPORT_TO_SOL;
      balances['SOL'] = solBalanceInSol;
    }

    // Return early if only SOL balance was requested
    if (
      effectiveSymbols &&
      effectiveSymbols.length === 1 &&
      effectiveSymbols[0].toUpperCase() === 'SOL'
    ) {
      return balances;
    }

    // Get all token accounts for the provided address
    const [legacyAccounts, token2022Accounts] = await Promise.all([
      this.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      }),
      this.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const allAccounts = [...legacyAccounts.value, ...token2022Accounts.value];

    // Track tokens that were found and those that still need to be fetched
    const foundTokens = new Set<string>();
    const tokensToFetch = new Map<string, string>(); // Maps address -> display symbol

    // Create a mapping of all mint addresses to their token accounts
    const mintToAccount = new Map();
    for (const value of allAccounts) {
      try {
        const programId = value.account.owner;
        const parsedAccount = unpackAccount(
          value.pubkey,
          value.account,
          programId,
        );
        const mintAddress = parsedAccount.mint.toBase58();
        mintToAccount.set(mintAddress, { parsedAccount, value });
      } catch (error) {
        logger.warn(`Error unpacking account: ${error.message}`);
        continue;
      }
    }

    // Process requested specific symbols
    if (effectiveSymbols) {
      for (const s of effectiveSymbols) {
        // Skip SOL as it's handled separately
        if (s.toUpperCase() === 'SOL') {
          foundTokens.add('SOL');
          continue;
        }

        // Check if it's a token symbol in our list
        const tokenBySymbol = this.tokenList.find(
          (t) => t.symbol.toUpperCase() === s.toUpperCase(),
        );

        if (tokenBySymbol) {
          foundTokens.add(tokenBySymbol.symbol);

          // Check if we have this token in the wallet
          if (mintToAccount.has(tokenBySymbol.address)) {
            const { parsedAccount } = mintToAccount.get(tokenBySymbol.address);
            const amount = parsedAccount.amount;
            const uiAmount =
              Number(amount) / Math.pow(10, tokenBySymbol.decimals);
            balances[tokenBySymbol.symbol] = uiAmount;
            logger.debug(
              `Found balance for ${tokenBySymbol.symbol}: ${uiAmount}`,
            );
          } else {
            // Token not found in wallet, set balance to 0
            balances[tokenBySymbol.symbol] = 0;
            logger.debug(
              `No balance found for ${tokenBySymbol.symbol}, setting to 0`,
            );
          }
        }
        // If it looks like a Solana address, prepare to fetch it directly
        else if (s.length >= 32 && s.length <= 44) {
          try {
            // Validate it's a proper public key
            const pubKey = new PublicKey(s);
            const mintAddress = pubKey.toBase58();

            // Check if we have this mint in the wallet
            if (mintToAccount.has(mintAddress)) {
              const { parsedAccount } = mintToAccount.get(mintAddress);

              // Try to get token from our token list
              const token = this.tokenList.find(
                (t) => t.address === mintAddress,
              );

              if (token) {
                // Token is in our list
                foundTokens.add(token.symbol);
                const amount = parsedAccount.amount;
                const uiAmount = Number(amount) / Math.pow(10, token.decimals);
                balances[token.symbol] = uiAmount;
                logger.debug(
                  `Found balance for ${token.symbol} (${mintAddress}): ${uiAmount}`,
                );
              } else {
                // Token is not in our list, need to fetch its metadata
                tokensToFetch.set(mintAddress, s);
              }
            } else {
              // Mint not found in wallet, add to tokens to fetch for metadata
              tokensToFetch.set(mintAddress, s);
            }
          } catch (e) {
            logger.warn(`Invalid token address format: ${s}`);
          }
        } else {
          logger.warn(
            `Token not recognized: ${s} (not a known symbol or valid address)`,
          );
        }
      }
    } else {
      // No symbols provided or empty array - check all tokens in the token list
      // Note: When symbols is an empty array, we check all tokens in the token list
      logger.info(
        `Checking balances for all ${this.tokenList.length} tokens in the token list`,
      );

      // Process all tokens from the token list
      for (const token of this.tokenList) {
        // Skip if already processed
        if (token.symbol === 'SOL' || foundTokens.has(token.symbol)) {
          continue;
        }

        // Check if we have this token in the wallet
        if (mintToAccount.has(token.address)) {
          const { parsedAccount } = mintToAccount.get(token.address);
          const amount = parsedAccount.amount;
          const uiAmount = Number(amount) / Math.pow(10, token.decimals);
          balances[token.symbol] = uiAmount;
          logger.debug(
            `Found balance for ${token.symbol} (${token.address}): ${uiAmount}`,
          );
        } else {
          // Set balance to 0 for tokens in the list but not in wallet
          balances[token.symbol] = 0;
          logger.debug(
            `No balance found for ${token.symbol} (${token.address}), setting to 0`,
          );
        }
      }
    }

    // Fetch metadata for unknown tokens
    for (const [mintAddress] of tokensToFetch.entries()) {
      try {
        // Check if we have this mint in the wallet
        let balance = 0;
        let decimals = 0;

        if (mintToAccount.has(mintAddress)) {
          const { parsedAccount } = mintToAccount.get(mintAddress);
          // Fetch mint info to get decimals
          const mintInfo = await getMint(this.connection, parsedAccount.mint);
          decimals = mintInfo.decimals;

          // Calculate balance
          const amount = parsedAccount.amount;
          balance = Number(amount) / Math.pow(10, decimals);
        } else {
          // Try to get decimals anyway for the display
          try {
            const mintInfo = await getMint(
              this.connection,
              new PublicKey(mintAddress),
            );
            decimals = mintInfo.decimals;
          } catch (error) {
            logger.warn(
              `Could not fetch mint info for ${mintAddress}: ${error.message}`,
            );
            decimals = 9; // Default to 9 decimals
          }
        }

        // Use the full mint address as the display key for the balance
        balances[mintAddress] = balance;
        logger.debug(
          `Using full address as display key for ${mintAddress} with balance ${balance}`,
        );
      } catch (error) {
        logger.error(
          `Failed to process token ${mintAddress}: ${error.message}`,
        );
      }
    }

    // Filter out zero balances when no specific tokens are requested
    if (!symbols || (symbols && symbols.length === 0)) {
      const filteredBalances: Record<string, number> = {};

      // Keep SOL balance regardless of its value
      if ('SOL' in balances) {
        filteredBalances['SOL'] = balances['SOL'];
      }

      // Filter other tokens with zero balances
      Object.entries(balances).forEach(([key, value]) => {
        if (key !== 'SOL' && value > 0) {
          filteredBalances[key] = value;
        }
      });

      return filteredBalances;
    }

    return balances;
  }

  // returns a Solana TransactionResponse for a txHash.
  async getTransaction(
    payerSignature: string,
  ): Promise<VersionedTransactionResponse | null> {
    return this.connection.getTransaction(payerSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  }

  // returns a Solana TransactionResponseStatusCode for a txData.
  public async getTransactionStatusCode(
    txData: TransactionResponse | null,
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

  public async estimateGas(computeUnits?: number): Promise<number> {
    const computeUnitsToUse = computeUnits || this.config.defaultComputeUnits;
    const priorityFeePerCU = await this.estimateGasPrice();
    const priorityFee = computeUnitsToUse * priorityFeePerCU;

    // Add base fee (in lamports) and convert total to SOL
    const totalLamports = BASE_FEE + priorityFee;
    const gasCost = totalLamports * LAMPORT_TO_SOL;

    return gasCost;
  }

  async estimateGasPrice(): Promise<number> {
    // Check cache first
    if (
      Solana.lastPriorityFeeEstimate &&
      Date.now() - Solana.lastPriorityFeeEstimate.timestamp <
        Solana.PRIORITY_FEE_CACHE_MS
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
        logger.error(
          `Failed to fetch priority fees, using minimum fee: ${response.status}`,
        );
        // Default to 0.1 lamports/CU as minimum
        return 0.1;
      }

      const data: PriorityFeeResponse = await response.json();

      // Extract fees and filter out zeros
      const fees = data.result
        .map((item) => item.prioritizationFee)
        .filter((fee) => fee > 0);

      // Default to 0.1 lamports/CU as minimum
      const minimumFeeLamports = 0.1;
      if (fees.length === 0) {
        return minimumFeeLamports;
      }

      // Sort fees in ascending order for percentile calculation
      fees.sort((a, b) => a - b);

      // Calculate statistics
      const minFee = Math.min(...fees) / 1_000_000; // Convert to lamports
      const maxFee = Math.max(...fees) / 1_000_000; // Convert to lamports
      const averageFee =
        fees.reduce((sum, fee) => sum + fee, 0) / fees.length / 1_000_000; // Convert to lamports
      logger.info(
        `Recent priority fees paid: ${minFee.toFixed(4)} - ${maxFee.toFixed(4)} lamports/CU (avg: ${averageFee.toFixed(4)})`,
      );

      // Calculate index for percentile
      const percentileIndex = Math.ceil(
        (fees.length * this.config.basePriorityFeePct) / 100,
      );
      let basePriorityFee = fees[percentileIndex - 1] / 1_000_000; // Convert to lamports

      // Ensure fee is not below minimum (convert SOL to lamports)
      basePriorityFee = Math.max(basePriorityFee, minimumFeeLamports);

      logger.info(
        `Base priority fee: ${basePriorityFee.toFixed(4)} lamports/CU (${basePriorityFee === minimumFeeLamports ? 'minimum' : `${this.config.basePriorityFeePct}th percentile`})`,
      );

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
      const confirmationPromise = new Promise<{
        confirmed: boolean;
        txData?: any;
      }>(async (resolve, reject) => {
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
          return reject(
            new Error(
              `Transaction failed with error: ${JSON.stringify(txData.meta.err)}`,
            ),
          );
        }

        // More definitive check using slot confirmation
        const status = await this.connection.getSignatureStatus(signature);
        const isConfirmed =
          status.value?.confirmationStatus === 'confirmed' ||
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
    computeUnits?: number,
    priorityFeePerCU?: number,
  ): Promise<{ signature: string; fee: number }> {
    // Use provided priority fee or estimate it
    const currentPriorityFee =
      priorityFeePerCU ?? (await this.estimateGasPrice());
    const computeUnitsToUse = computeUnits || this.config.defaultComputeUnits;

    const basePriorityFeeLamports = currentPriorityFee * computeUnitsToUse;
    logger.info(
      `Sending transaction with ${currentPriorityFee} lamports/CU priority fee and total priority fee of ${(basePriorityFeeLamports * LAMPORT_TO_SOL).toFixed(6)} SOL`,
    );

    // Prepare transaction with compute budget
    if (tx instanceof Transaction) {
      tx = await this.prepareTx(
        tx,
        currentPriorityFee,
        computeUnitsToUse,
        signers,
      );
    } else {
      tx = await this.prepareVersionedTx(
        tx,
        currentPriorityFee,
        computeUnitsToUse,
        signers,
      );
      await this.connection.simulateTransaction(tx);
    }

    // Use the confirmation retry logic from sendAndConfirmRawTransaction
    const serializedTx = tx.serialize();
    const { confirmed, signature, txData } =
      await this._sendAndConfirmRawTransaction(serializedTx);

    if (confirmed && txData) {
      const actualFee = this.getFee(txData);
      logger.info(
        `Transaction ${signature} confirmed with total fee: ${actualFee.toFixed(6)} SOL`,
      );
      return { signature, fee: actualFee };
    }

    throw new Error(
      `Transaction failed to confirm after ${this.config.confirmRetryCount} attempts`,
    );
  }

  private async prepareTx(
    tx: Transaction,
    currentPriorityFee: number,
    computeUnitsToUse: number,
    signers: Signer[],
  ): Promise<Transaction> {
    const priorityFeeMicroLamports = Math.floor(currentPriorityFee * 1_000_000);
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFeeMicroLamports,
    });

    // Remove any existing priority fee instructions and add the new one
    tx.instructions = [
      ...tx.instructions.filter(
        (inst) => !inst.programId.equals(ComputeBudgetProgram.programId),
      ),
      priorityFeeInstruction,
    ];

    // Set compute unit limit
    const computeUnitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnitsToUse,
    });
    tx.add(computeUnitInstruction);

    // Get latest blockhash
    const {
      value: { lastValidBlockHeight, blockhash },
    } = await this.connection.getLatestBlockhashAndContext('confirmed');

    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);

    return tx;
  }

  private async prepareVersionedTx(
    tx: VersionedTransaction,
    currentPriorityFee: number,
    computeUnits: number,
    _signers: Signer[],
  ): Promise<VersionedTransaction> {
    const originalMessage = tx.message;
    const originalStaticCount = originalMessage.staticAccountKeys.length;
    const originalSignatures = tx.signatures; // Clone original signatures array

    let modifiedTx: VersionedTransaction;

    // Create new compute budget instructions
    const priorityFeeMicroLamports = Math.floor(currentPriorityFee * 1_000_000);
    const computeBudgetInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeeMicroLamports,
      }),
    ];

    // Check if ComputeBudgetProgram is in static keys
    const computeBudgetProgramIndex =
      originalMessage.staticAccountKeys.findIndex((key) =>
        key.equals(ComputeBudgetProgram.programId),
      );

    // Add ComputeBudget program to static keys, adjust indexes, and create modified instructions
    if (computeBudgetProgramIndex === -1) {
      // Add ComputeBudget program to static keys
      const newStaticKeys = [
        ...originalMessage.staticAccountKeys,
        ComputeBudgetProgram.programId,
      ];

      // Process original instructions with index adjustment
      const originalInstructions = originalMessage.compiledInstructions.map(
        (ix) => ({
          ...ix,
          accountKeyIndexes: ix.accountKeyIndexes.map((index) =>
            index >= originalStaticCount ? index + 1 : index,
          ),
        }),
      );

      // Create modified instructions
      const modifiedInstructions = [
        ...computeBudgetInstructions.map((ix) => ({
          programIdIndex: newStaticKeys.indexOf(ComputeBudgetProgram.programId), // Use new index
          accountKeyIndexes: [],
          data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
        })),
        ...originalInstructions,
      ];

      // Build new transaction
      modifiedTx = new VersionedTransaction(
        new MessageV0({
          header: originalMessage.header,
          staticAccountKeys: newStaticKeys,
          recentBlockhash: originalMessage.recentBlockhash!,
          compiledInstructions: modifiedInstructions.map((ix) => ({
            programIdIndex: ix.programIdIndex,
            accountKeyIndexes: ix.accountKeyIndexes,
            data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
          })),
          addressTableLookups: originalMessage.addressTableLookups,
        }),
      );
    } else {
      // Remove compute budget instructions from original instructions
      const nonComputeBudgetInstructions =
        originalMessage.compiledInstructions.filter(
          (ix) =>
            !originalMessage.staticAccountKeys[ix.programIdIndex].equals(
              ComputeBudgetProgram.programId,
            ),
        );

      // Create modified instructions
      const modifiedInstructions = [
        ...computeBudgetInstructions.map((ix) => ({
          programIdIndex: computeBudgetProgramIndex, // Use existing index if already present
          accountKeyIndexes: [],
          data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
        })),
        ...nonComputeBudgetInstructions,
      ];
      // Build new transaction with same keys but modified instructions
      modifiedTx = new VersionedTransaction(
        new MessageV0({
          header: originalMessage.header,
          staticAccountKeys: originalMessage.staticAccountKeys,
          recentBlockhash: originalMessage.recentBlockhash,
          compiledInstructions: modifiedInstructions.map((ix) => ({
            programIdIndex: ix.programIdIndex,
            accountKeyIndexes: ix.accountKeyIndexes,
            data: ix.data instanceof Buffer ? new Uint8Array(ix.data) : ix.data,
          })),
          addressTableLookups: originalMessage.addressTableLookups,
        }),
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
    transaction: VersionedTransaction | Transaction,
  ): Promise<{ confirmed: boolean; signature: string; txData: any }> {
    // Convert Transaction to VersionedTransaction if necessary
    if (!(transaction instanceof VersionedTransaction)) {
      // Ensure transaction is properly prepared
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = transaction.recentBlockhash || blockhash;
      transaction.feePayer =
        transaction.feePayer || transaction.signatures[0]?.publicKey || null;

      // Get serialized transaction bytes
      const serializedTx = transaction.serialize();
      return this._sendAndConfirmRawTransaction(serializedTx);
    }

    // For VersionedTransaction, use existing logic
    const serializedTx = transaction.serialize();
    return this._sendAndConfirmRawTransaction(serializedTx);
  }

  // Create a private method to handle the actual sending
  private async _sendAndConfirmRawTransaction(
    serializedTx: Buffer | Uint8Array,
  ): Promise<{ confirmed: boolean; signature: string; txData: any }> {
    let retryCount = 0;
    while (retryCount < this.config.confirmRetryCount) {
      const signature = await this.connection.sendRawTransaction(serializedTx, {
        skipPreflight: true,
      });
      const { confirmed, txData } = await this.confirmTransaction(signature);
      logger.info(
        `[${retryCount + 1}/${this.config.confirmRetryCount}] Transaction ${signature} status: ${confirmed ? 'confirmed' : 'unconfirmed'}`,
      );
      if (confirmed && txData) {
        return { confirmed, signature, txData };
      }
      retryCount++;
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.confirmRetryInterval * 1000),
      );
    }
    return { confirmed: false, signature: '', txData: null };
  }

  async sendRawTransaction(
    rawTx: Buffer | Uint8Array | Array<number>,
    lastValidBlockHeight: number,
  ): Promise<string> {
    const blockheight = await this.connection.getBlockHeight({
      commitment: 'confirmed',
    });

    if (blockheight > lastValidBlockHeight + 50) {
      throw new Error('Maximum blockheight exceeded');
    }

    try {
      const signature = await this.connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 0,
      });
      return signature;
    } catch (error) {
      logger.error('Failed to send raw transaction:', error);
      throw error;
    }
  }

  /**
   * Extract balance changes and fee from a transaction for multiple tokens
   * @param signature Transaction signature
   * @param owner Owner address (required for SPL tokens and SOL balance extraction)
   * @param tokens Array of token mint addresses or 'SOL' for native SOL
   * @returns Array of balance changes in the same order as tokens, and transaction fee
   */
  async extractBalanceChangesAndFee(
    signature: string,
    owner: string,
    tokens: string[],
  ): Promise<{
    balanceChanges: number[];
    fee: number;
  }> {
    // Fetch transaction details
    const txDetails = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!txDetails) {
      throw new Error(`Transaction ${signature} not found`);
    }

    // Calculate fee (always in SOL)
    const fee = (txDetails.meta?.fee || 0) * LAMPORT_TO_SOL;

    const preBalances = txDetails.meta?.preBalances || [];
    const postBalances = txDetails.meta?.postBalances || [];
    const preTokenBalances = txDetails.meta?.preTokenBalances || [];
    const postTokenBalances = txDetails.meta?.postTokenBalances || [];
    const ownerPubkey = new PublicKey(owner);

    // Process each token and return array of balance changes
    const balanceChanges = tokens.map((token) => {
      // Check if this is native SOL
      if (token === 'So11111111111111111111111111111111111111112') {
        // For native SOL, we need to calculate from lamport balance changes
        const accountIndex =
          txDetails.transaction.message.accountKeys.findIndex((key) =>
            key.pubkey.equals(ownerPubkey),
          );

        if (accountIndex === -1) {
          logger.warn(`Owner ${owner} not found in transaction accounts`);
          return 0;
        }

        // Calculate SOL change including fees
        const lamportChange =
          postBalances[accountIndex] - preBalances[accountIndex];
        return lamportChange * LAMPORT_TO_SOL;
      } else {
        // Token mint address provided - get SPL token balance change
        const preBalance =
          preTokenBalances.find(
            (balance) => balance.mint === token && balance.owner === owner,
          )?.uiTokenAmount.uiAmount || 0;

        const postBalance =
          postTokenBalances.find(
            (balance) => balance.mint === token && balance.owner === owner,
          )?.uiTokenAmount.uiAmount || 0;

        return postBalance - preBalance;
      }
    });

    return { balanceChanges, fee };
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
  public static async getFirstWalletAddress(): Promise<string | null> {
    // Specifically look in the solana subdirectory, not in any other chain's directory
    const safeChain = sanitizePathComponent('solana');
    const path = `${walletPath}/${safeChain}`;
    try {
      // Create directory if it doesn't exist
      await fse.ensureDir(path);

      // Get all .json files in the directory
      const files = await fse.readdir(path);
      const walletFiles = files.filter((f) => f.endsWith('.json'));

      if (walletFiles.length === 0) {
        return null;
      }

      // Get the first wallet address (without .json extension)
      const walletAddress = walletFiles[0].slice(0, -5);

      try {
        // Attempt to validate the address
        return Solana.validateAddress(walletAddress);
      } catch (e) {
        logger.warn(
          `Invalid Solana address found in wallet directory: ${walletAddress}`,
        );
        return null;
      }
    } catch (error) {
      logger.error(`Error getting Solana wallet address: ${error.message}`);
      return null;
    }
  }

  public static async getWalletAddressExample(): Promise<string> {
    if (Solana._walletAddressExample) {
      return Solana._walletAddressExample;
    }
    // Use a valid Solana address format (system program address)
    const defaultAddress = '11111111111111111111111111111112';
    try {
      const foundWallet = await Solana.getFirstWalletAddress();
      if (foundWallet) {
        Solana._walletAddressExample = foundWallet;
        return foundWallet;
      }
      logger.debug('No wallets found for examples in schema, using default.');
      Solana._walletAddressExample = defaultAddress;
      return defaultAddress;
    } catch (error) {
      logger.error(
        `Error getting Solana wallet address for example: ${error.message}`,
      );
      return defaultAddress;
    }
  }

  // Update getTokenBySymbol to use new getToken method
  public async getTokenBySymbol(
    tokenSymbol: string,
  ): Promise<TokenInfo | undefined> {
    return (await this.getToken(tokenSymbol)) || undefined;
  }

  public async simulateTransaction(
    transaction: VersionedTransaction | Transaction,
  ) {
    try {
      if (!(transaction instanceof VersionedTransaction)) {
        // Convert regular Transaction to VersionedTransaction for simulation
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = transaction.recentBlockhash || blockhash;
        transaction.feePayer =
          transaction.feePayer || transaction.signatures[0]?.publicKey || null;

        // Convert to VersionedTransaction
        const messageV0 = new MessageV0({
          header: transaction.compileMessage().header,
          staticAccountKeys: transaction.compileMessage().staticAccountKeys,
          recentBlockhash: transaction.recentBlockhash,
          compiledInstructions:
            transaction.compileMessage().compiledInstructions,
          addressTableLookups: [],
        });

        transaction = new VersionedTransaction(messageV0);
      }

      // Now handle all as VersionedTransaction
      const { value: simulatedTransactionResponse } =
        await this.connection.simulateTransaction(transaction, {
          replaceRecentBlockhash: false,
          commitment: 'confirmed',
          accounts: { encoding: 'base64', addresses: [] },
          sigVerify: false,
        });

      logger.info('Simulation Result:', {
        unitsConsumed: simulatedTransactionResponse.unitsConsumed,
        status: simulatedTransactionResponse.err ? 'FAILED' : 'SUCCESS',
      });

      if (simulatedTransactionResponse.err) {
        const logs = simulatedTransactionResponse.logs || [];
        const errorMessage = `${SIMULATION_ERROR_MESSAGE}\nError: ${JSON.stringify(simulatedTransactionResponse.err)}\nProgram Logs: ${logs.join('\n')}`;

        logger.error(errorMessage);

        throw new Error(errorMessage);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Transaction simulation failed: ${error.message}`);
        throw error;
      }
      throw new Error(`Error simulating transaction: ${error.message}`);
    }
  }

  // @deprecated Use sendAndConfirmRawTransaction instead
  public async sendAndConfirmVersionedTransaction(
    tx: VersionedTransaction,
    signers: Signer[] = [],
    computeUnits?: number,
  ): Promise<{ signature: string; fee: number }> {
    logger.warn(
      'sendAndConfirmVersionedTransaction is deprecated. Use sendAndConfirmRawTransaction instead.',
    );

    const currentPriorityFee = Math.floor(await this.estimateGasPrice());
    const computeUnitsToUse = computeUnits || this.config.defaultComputeUnits;

    // Prepare transaction with compute budget instructions
    const modifiedTx = await this.prepareVersionedTx(
      tx,
      currentPriorityFee,
      computeUnitsToUse,
      signers,
    );

    // Use the new method
    const result = await this.sendAndConfirmRawTransaction(modifiedTx);

    if (result.confirmed && result.txData) {
      const actualFee = this.getFee(result.txData);
      return { signature: result.signature, fee: actualFee };
    }

    throw new Error(
      `Transaction ${result.signature} not confirmed after multiple attempts`,
    );
  }
}

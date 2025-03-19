import { ApiPromise, WsProvider, HttpProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { mnemonicGenerate, mnemonicValidate } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex, formatBalance } from '@polkadot/util';
import { encodeAddress, decodeAddress } from '@polkadot/util-crypto';
import { TokenInfo } from '../ethereum/ethereum-base';
import { Config, getPolkadotConfig } from './polkadot.config';
import { PolkadotController } from './polkadot.controllers';
import { HttpException } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { TokenListType } from '../../services/base';
import {
  PolkadotAccount,
  TransactionStatus,
  TransactionDetails,
  SubmittableTransaction,
  TokenBalance,
  TransactionReceipt,
  TransferOptions,
  BatchTransactionOptions,
  StakingInfo,
  FeeEstimate
} from './polkadot.types';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { BN } from 'bn.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import axios from 'axios';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { walletPath } from '../../services/base';

interface PollResponse {
  network: string;
  currentBlock: number;
  txHash: string;
  txBlock: number;
  txStatus: number;
  txData: any | null;
  fee: number | null;
  timestamp: number;
  latency: number;
  error?: string;
}

interface HydrationTransaction {
  code: number;
  message?: string;
  data: {
    block_num?: number;
    fee?: string;
    success?: boolean;
    finalized?: boolean;
    // Add other properties as needed based on actual API response
  };
}

/**
 * Main class for interacting with the Polkadot blockchain.
 */
export class Polkadot {
  public api: ApiPromise;
  public network: string;
  public chain: string = 'polkadot';
  public nativeTokenSymbol: string;
  public tokenList: TokenInfo[] = [];
  public config: Config;
  private _tokenMap: Record<string, TokenInfo> = {};
  private _keyring: Keyring;

  private static _instances: { [name: string]: Polkadot } = {};
  public controller: typeof PolkadotController;

  /**
   * Private constructor - use getInstance instead
   * @param network The network to connect to
   */
  private constructor(network: string) {
    this.network = network;
    this.config = getPolkadotConfig('polkadot', network);
    this.nativeTokenSymbol = this.config.network.nativeCurrencySymbol;
    this.controller = PolkadotController;

    const { Keyring } = require('@polkadot/keyring');
    this._keyring = new Keyring({ type: 'sr25519' });
  }

  /**
   * Get or create an instance of the Polkadot class
   * @param network The network to connect to
   * @returns A Promise that resolves to a Polkadot instance
   */
  public static async getInstance(network: string): Promise<Polkadot> {
    if (!Polkadot._instances[network]) {
      Polkadot._instances[network] = new Polkadot(network);
      await Polkadot._instances[network].init();
    }
    return Polkadot._instances[network];
  }

  /**
   * Initialize the Polkadot instance
   * @returns A Promise that resolves when initialization is complete
   */
  private async init(): Promise<void> {
    try {
      logger.info(`Initializing Polkadot for network: ${this.network}`);

      // Wait for crypto to be ready
      await cryptoWaitReady();
      
      // Initialize keyring
      this._keyring = new Keyring({
        type: 'sr25519',
        ss58Format: this.config.network.ss58Format
      });
      
      // Connect to the node
      const provider = this.config.network.nodeURL.startsWith('http')
        ? new HttpProvider(this.config.network.nodeURL)
        : new WsProvider(this.config.network.nodeURL);
      
      this.api = await ApiPromise.create({ provider: provider });
      
      // Wait for API to be ready
      await this.api.isReady;
      
      // Load token list
      await this.getTokenList(
        this.config.network.tokenListSource,
        this.config.network.tokenListType
      );

      logger.info(`Polkadot initialized for network: ${this.network}`);
    } catch (error) {
      logger.error(`Failed to initialize Polkadot: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the token list from the specified source
   * @param tokenListSource URL or path to the token list
   * @param tokenListType Type of token list (e.g., JSON, CSV)
   * @returns A Promise that resolves to a list of token info
   */
  async getTokenList(
    tokenListSource?: string,
    tokenListType?: TokenListType
  ): Promise<TokenInfo[]> {
    try {
      if (!tokenListSource || !tokenListType) {
        tokenListSource = this.config.network.tokenListSource;
        tokenListType = this.config.network.tokenListType;
      }

      await this.loadTokens(tokenListSource, tokenListType);
      return this.tokenList;
    } catch (error) {
      logger.error(`Failed to get token list: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load tokens from the specified source and type
   * @param tokenListSource URL or path to the token list
   * @param tokenListType Type of token list (e.g., JSON, CSV)
   */
  async loadTokens(
    tokenListSource: string,
    tokenListType: TokenListType
  ): Promise<void> {
    try {
      // Clear existing token lists
      this.tokenList = [];
      this._tokenMap = {};

      // Load tokens from source
      let tokensData: any[] = [];
      
      if (tokenListType === 'URL') {
        const response = await axios.get(tokenListSource);
        tokensData = response.data || [];
      } else {
        const data = await fs.promises.readFile(tokenListSource, { encoding: 'utf8' });
        const parsed = JSON.parse(data);
        tokensData = parsed || [];
      }

      // Process tokens
      for (const tokenData of tokensData) {
        const token: TokenInfo = {
          symbol: tokenData.symbol,
          name: tokenData.name,
          decimals: tokenData.decimals,
          address: tokenData.id.toString(), // Use token ID as address
          chainId: 0
        };

        this.tokenList.push(token);
        this._tokenMap[token.symbol.toLowerCase()] = token;
        this._tokenMap[token.address.toLowerCase()] = token;
      }

      logger.info(`Loaded ${this.tokenList.length} tokens for network: ${this.network}`);
    } catch (error) {
      logger.error(`Failed to load tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get token information by address or symbol
   * @param addressOrSymbol Token address or symbol
   * @returns A Promise that resolves to token info or null if not found
   */
  async getToken(addressOrSymbol: string): Promise<TokenInfo | null> {
    try {
      // First check the token map
      const token = this._tokenMap[addressOrSymbol.toLowerCase()];
      if (token) {
        return token;
      }

      // Try to find token by symbol or address
      const foundToken = this.tokenList.find(
        (t) =>
          t.symbol.toLowerCase() === addressOrSymbol.toLowerCase() ||
          t.address.toLowerCase() === addressOrSymbol.toLowerCase()
      );

      return foundToken || null;
    } catch (error) {
      logger.error(`Failed to get token: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a new account with a generated mnemonic
   * @returns A Promise that resolves to a new account
   */
  async createAccount(): Promise<PolkadotAccount> {
    try {
      // Generate mnemonic
      const mnemonic = mnemonicGenerate();

      // Create keyring pair
      const keyringPair = this._keyring.addFromMnemonic(mnemonic);

      const account: PolkadotAccount = {
        address: keyringPair.address,
        publicKey: u8aToHex(keyringPair.publicKey),
        keyringPair
      };

      return account;
    } catch (error) {
      logger.error(`Failed to create account: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a keyring pair from a private key
   * @param seed The private key in mnemonic format
   * @returns The keyring pair
   */
  getKeyringPairFromMnemonic(seed: string): KeyringPair {
    try {
      return this._keyring.addFromMnemonic(seed);
    } catch (error) {
      logger.error(`Failed to get keyring pair from private key: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a wallet from an address (loads from encrypted file)
   * @param address The address of the wallet
   * @returns A Promise that resolves to the keyring pair
   */
  async getWallet(address: string): Promise<KeyringPair> {
    try {
      // Check if address is valid
      this.validatePolkadotAddress(address);

      // Look for existing pair with this address
      const existingPair = this._keyring.getPairs().find(pair => pair.address === address);
      if (existingPair) {
        return existingPair;
      }

      // If not found in memory, load from encrypted file
      try {
        // Path to the wallet file
        const path = `${walletPath}/${this.chain}`;
        const walletFile = `${path}/${address}.json`;
        
        // Read encrypted mnemonic from file
        const encryptedMnemonic = await fs.promises.readFile(walletFile, 'utf8');
        
        // Get passphrase using ConfigManagerCertPassphrase
        const passphrase = ConfigManagerCertPassphrase.readPassphrase();
        if (!passphrase) {
          throw new Error('Missing passphrase for wallet decryption');
        }
        
        // Decrypt the mnemonic
        const mnemonic = await this.decrypt(encryptedMnemonic, passphrase);
        
        // Add to keyring and return
        return this._keyring.addFromUri(mnemonic);
      } catch (error) {
        logger.error(`Failed to load wallet from file: ${error.message}`);
        throw new HttpException(
          500,
          `Wallet not found for address: ${address}. You need to import the private key or mnemonic first.`,
          -1
        );
      }
    } catch (error) {
      logger.error(`Failed to get wallet: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a Polkadot address
   * @param address The address to validate
   * @returns True if valid, throws error if invalid
   */
  validatePolkadotAddress(address: string): boolean {
    try {
      // Try to decode the address - will throw if invalid
      decodeAddress(address, false, this.config.network.ss58Format);
      return true;
    } catch (error) {
      logger.error(`Invalid Polkadot address: ${address}`);
      throw new HttpException(
        400,
        `Invalid Polkadot address: ${address}`,
        -1
      );
    }
  }

  /**
   * Encrypt a secret (like a private key or mnemonic)
   * @param mnemonic The secret to encrypt
   * @param password The password to encrypt with
   * @returns A Promise that resolves to the encrypted secret
   */
  async encrypt(mnemonic: string, password: string): Promise<string> {
    try {
      const key = crypto.createHash('sha256').update(password).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(mnemonic, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error(`Failed to encrypt secret: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decrypt an encrypted secret
   * @param encryptedSecret The encrypted secret
   * @param password The password to decrypt with
   * @returns A Promise that resolves to the decrypted secret
   */
  async decrypt(encryptedSecret: string, password: string): Promise<string> {
    try {
      const [ivHex, encryptedText] = encryptedSecret.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.createHash('sha256').update(password).digest();
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error(`Failed to decrypt secret: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get balances for a wallet
   * @param wallet The keyring pair
   * @param symbols Optional list of token symbols to get balances for
   * @returns A Promise that resolves to a record of balances
   */
  async getBalance(wallet: KeyringPair, symbols?: string[]): Promise<Record<string, number>> {
    try {
      const balances: Record<string, number> = {};
      const address = wallet.address;
      
      // Determine which tokens to check
      let tokensToCheck: TokenInfo[] = [];
      if (symbols && symbols.length > 0) {
        // Filter tokens by specified symbols
        for (const symbol of symbols) {
          const token = await this.getToken(symbol);
          if (token) {
            tokensToCheck.push(token);
          }
        }
      } else {
        // Use all tokens in the token list
        tokensToCheck = this.tokenList;
      }

      // Get native token balance
      const nativeToken = tokensToCheck.find(t => t.symbol === this.nativeTokenSymbol);
      if (nativeToken) {
        const accountInfo = await this.api.query.system.account(address);
        // @ts-ignore - Handle type issues with accountInfo structure
        const freeBalance = accountInfo.data.balance || accountInfo.data.free.toString();
        // @ts-ignore - Handle type issues with accountInfo structure
        const reservedBalance = accountInfo.data.reserved.toString();
        const totalBalance = new BN(freeBalance).add(new BN(reservedBalance));
        
        balances[nativeToken.symbol] = this.fromBaseUnits(
          totalBalance.toString(),
          nativeToken.decimals
        );
      }

      // Get balances for other tokens
      for (const token of tokensToCheck) {
        // Skip native token as we already processed it
        if (token.symbol === this.nativeTokenSymbol) continue;
        
        try {
          // Check if tokens module exists
          if (this.api.query.tokens && this.api.query.tokens.accounts) {
            const assetBalance = await this.api.query.tokens.accounts(address, token.address);
            if (assetBalance) {
              // @ts-ignore - Handle type issues with assetBalance structure
              const free = assetBalance.free?.toString() || '0';
              balances[token.symbol] = this.fromBaseUnits(free, token.decimals);
            } else {
              balances[token.symbol] = 0;
            }
          } else if (this.api.query.assets && this.api.query.assets.account) {
            // Alternative assets pallet approach if available
            const assetBalance = await this.api.query.assets.account(token.address, address);
            if (assetBalance && !assetBalance.isEmpty) {
              // Handle Option<AssetBalance> - use type-safe methods instead of isSome/unwrap
              const balanceData = assetBalance as any;
              const balance = balanceData.balance?.toString() || 
                             (balanceData.toJSON && balanceData.toJSON().balance) || '0';
              balances[token.symbol] = this.fromBaseUnits(balance, token.decimals);
            } else {
              balances[token.symbol] = 0;
            }
          } else {
            // If no token module is available, set balance to 0
            balances[token.symbol] = 0;
          }
        } catch (err) {
          logger.warn(`Error getting balance for token ${token.symbol}: ${err.message}`);
          balances[token.symbol] = 0;
        }
      }

      return balances;
    } catch (error) {
      logger.error(`Failed to get balance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert from base units to a human-readable decimal
   * @param amount Amount in base units (as string to handle large numbers)
   * @param decimals Number of decimals
   * @returns The human-readable decimal
   */
  fromBaseUnits(amount: string, decimals: number): number {
    try {
      const divisor = new BN(10).pow(new BN(decimals));
      const amountBN = new BN(amount);
      const wholePart = amountBN.div(divisor).toString();

      const fractionalBN = amountBN.mod(divisor);
      let fractionalPart = fractionalBN.toString().padStart(decimals, '0');

      // Trim trailing zeros
      while (fractionalPart.endsWith('0') && fractionalPart.length > 0) {
        fractionalPart = fractionalPart.slice(0, -1);
      }

      // Format for JS number conversion
      const result = `${wholePart}${fractionalPart.length > 0 ? '.' + fractionalPart : ''}`;
      return parseFloat(result);
    } catch (error) {
      logger.error(`Failed to convert from base units: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert to base units from a human-readable decimal
   * @param amount Amount in human-readable form
   * @param decimals Number of decimals
   * @returns The amount in base units as a string
   */
  toBaseUnits(amount: number, decimals: number): string {
    try {
      // Convert to string for precision
      const amountStr = amount.toString();

      // Split by decimal point
      const parts = amountStr.split('.');
      const wholePart = parts[0];
      const fractionalPart = parts.length > 1 ? parts[1].padEnd(decimals, '0').slice(0, decimals) : '0'.repeat(decimals);

      // Combine and convert to BN
      const result = wholePart + fractionalPart;

      // Remove leading zeros
      return new BN(result).toString();
    } catch (error) {
      logger.error(`Failed to convert to base units: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transaction details by hash
   * @param txHash The transaction hash
   * @returns A Promise that resolves to transaction details
   */
  public async getTransaction(txHash: string): Promise<any> {
    const startTime = Date.now();
    try {
      const currentBlock = await this.getCurrentBlockNumber();
      
      // Try to fetch transaction data
      let txData = null;
      let txStatus = 0; // Not found by default
      let blockNum = null;
      let fee = null;
      
      try {
        const headers = { 'Content-Type': 'application/json' };
        const body = { hash: txHash };
        
        const response = await axios.post(
          'https://hydration.api.subscan.io/api/scan/extrinsic',
          body,
          { headers }
        );
        
        if (response.data && response.data.data) {
          const transaction = response.data.data;
          
          // Extract transaction data
          txData = transaction;
          
          blockNum = transaction.block_num || currentBlock;
          fee = transaction.fee
            ? parseFloat(transaction.fee) / Math.pow(10, 10)
            : null;
          
          // Determine status based on success and finalized flags
          if (transaction.success) {
            txStatus = 1; // Success
          } else if (transaction.success === false) {
            txStatus = -1; // Failed
          } else if (transaction.finalized) {
            txStatus = 1; // Success if finalized
          }
        }
      } catch (error) {
        logger.error(`Error fetching transaction ${txHash}: ${error.message}`);
      }
      
      return {
        network: this.network,
        currentBlock,
        txHash,
        txBlock: blockNum || currentBlock,
        txStatus,
        txData,
        fee,
        timestamp: Date.now(),
        latency: (Date.now() - startTime) / 1000
      };
    } catch (error) {
      logger.error(`Error in getTransaction for ${txHash}: ${error.message}`);
      const currentBlock = await this.getCurrentBlockNumber().catch(() => 0);
      
      return {
        network: this.network,
        currentBlock,
        txHash,
        txBlock: currentBlock,
        txStatus: 0,
        txData: null,
        fee: null,
        timestamp: Date.now(),
        latency: (Date.now() - startTime) / 1000
      };
    }
  }

  /**
   * Get transaction status code
   * @param txData Transaction data
   * @returns A Promise that resolves to the transaction status code
   */
  async getTransactionStatusCode(txData: any | null): Promise<TransactionStatus> {
    if (!txData) {
      return TransactionStatus.NOT_FOUND;
    }

    return txData.status as TransactionStatus;
  }

  /**
   * Get the current block number
   * @returns A Promise that resolves to the current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    try {
      const header = await this.api.rpc.chain.getHeader();
      return header.number.toNumber();
    } catch (error) {
      logger.error(`Failed to get current block number: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close the connection to the node
   */
  async close() {
    try {
      if (this.api) {
        await this.api.disconnect();
      }
    } catch (error) {
      logger.error(`Failed to close connection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create and sign a balance transfer transaction
   * @param sender The sender keyring pair
   * @param recipient The recipient address
   * @param amount The amount to transfer
   * @param options Optional transfer options
   * @returns A Promise that resolves to a submittable transaction
   */
  async createTransferTransaction(
    sender: KeyringPair,
    recipient: string,
    amount: string,
    options?: TransferOptions
  ): Promise<SubmittableTransaction> {
    try {
      // Validate recipient address
      this.validatePolkadotAddress(recipient);

      // Create transfer extrinsic
      const tx = options?.keepAlive
        ? this.api.tx.balances.transferKeepAlive(recipient, amount)
        : this.api.tx.balances.transfer(recipient, amount);

      // Add tip if specified
      if (options?.tip) {
        // @ts-ignore - Generic Method, needs to improve
        tx.signFakeSignature(sender, { tip: options.tip });
      } else {
        // @ts-ignore - Generic Method, needs to improve
        tx.signFakeSignature(sender);
      }

      // Get fee estimate
      const feeInfo = await tx.paymentInfo(sender);

      const feeEstimate: FeeEstimate = {
        estimatedFee: feeInfo.partialFee.toString(),
        partialFee: feeInfo.partialFee.toString(),
        weight: feeInfo.weight.toString()
      };

      return {
        tx: tx as SubmittableExtrinsic<'promise', ISubmittableResult>,
        feeEstimate
      };
    } catch (error) {
      logger.error(`Failed to create transfer transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Submit a transaction to the network and wait for confirmation
   * @param transaction The transaction to submit
   * @param options Optional submission options
   * @returns A Promise that resolves to a transaction receipt
   */
  async submitTransaction(
    transaction: SubmittableTransaction,
    options?: TransferOptions
  ): Promise<TransactionReceipt> {
    try {
      const timeout = options?.timeout || this.config.defaultTransactionTimeout;
      const shouldWaitForFinalization = options?.waitForFinalization !== false;

      return new Promise((resolve, reject) => {
        // Set timeout
        const timeoutId = setTimeout(() => {
          reject(new Error(`Transaction submission timed out after ${timeout}ms`));
        }, timeout);

        transaction.tx.send(async (result) => {
          if (result.isError) {
            clearTimeout(timeoutId);
            reject(new Error(`Transaction submission failed: ${result.internalError.toString()}`));
            return;
          }

          // Transaction was submitted
          if (result.isInBlock || (shouldWaitForFinalization && result.isFinalized)) {
            clearTimeout(timeoutId);

            const blockHash = result.isInBlock
              ? result.toHuman().toString()
              : result.toHuman().toString();

            const status = TransactionStatus.SUCCESS;

            // Get block information
            const blockInfo = await this.api.rpc.chain.getBlock(blockHash);
            const blockNumber = blockInfo.block.header.number.toNumber();

            // Get transaction fee if possible
            const fee = transaction.feeEstimate.partialFee;

            resolve({
              blockHash,
              blockNumber,
              events: result.events,
              status,
              transactionHash: transaction.tx.hash.toHex(),
              fee
            });
          }
        });
      });
    } catch (error) {
      logger.error(`Failed to submit transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Transfer tokens from one account to another
   * @param sender The sender keyring pair
   * @param recipient The recipient address
   * @param amount The amount to transfer
   * @param symbol The token symbol
   * @param options Optional transfer options
   * @returns A Promise that resolves to a transaction receipt
   */
  async transfer(
    sender: KeyringPair,
    recipient: string,
    amount: number,
    symbol: string,
    options?: TransferOptions
  ): Promise<TransactionReceipt> {
    try {
      // Get token info
      const token = await this.getToken(symbol);
      if (!token) {
        throw new Error(`Token not found: ${symbol}`);
      }

      // Convert amount to base units
      const amountInBaseUnits = this.toBaseUnits(amount, token.decimals);

      // Create and sign transaction
      const transaction = await this.createTransferTransaction(
        sender,
        recipient,
        amountInBaseUnits,
        options
      );

      // Submit transaction
      return this.submitTransaction(transaction, options);
    } catch (error) {
      logger.error(`Failed to transfer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a batch of transactions
   * @param sender The sender keyring pair
   * @param txs Array of transactions to batch
   * @param options Optional batch options
   * @returns A Promise that resolves to a submittable transaction
   */
  async createBatchTransaction(
    sender: KeyringPair,
    txs: SubmittableExtrinsic<'promise'>[],
    options?: BatchTransactionOptions
  ): Promise<SubmittableTransaction> {
    try {
      if (txs.length === 0) {
        throw new Error('No transactions provided for batch');
      }

      if (txs.length > this.config.batchTxLimit) {
        throw new Error(`Batch transaction limit exceeded: ${txs.length} > ${this.config.batchTxLimit}`);
      }

      // Create batch transaction
      const batchTx = options?.atomicBatch
        ? this.api.tx.utility.batchAll(txs)
        : this.api.tx.utility.batch(txs);

      // Add tip if specified
      if (options?.tip) {
        // @ts-ignore - Generic Method, needs to improve
        batchTx.signFakeSignature(sender, { tip: options.tip });
      } else {
        // @ts-ignore - Generic Method, needs to improve
        batchTx.signFakeSignature(sender);
      }

      // Get fee estimate
      const feeInfo = await batchTx.paymentInfo(sender);

      const feeEstimate: FeeEstimate = {
        estimatedFee: feeInfo.partialFee.toString(),
        partialFee: feeInfo.partialFee.toString(),
        weight: feeInfo.weight.toString()
      };

      return {
        tx: batchTx as SubmittableExtrinsic<'promise', ISubmittableResult>,
        feeEstimate
      };
    } catch (error) {
      logger.error(`Failed to create batch transaction: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get staking information for an account
   * @param address The account address
   * @returns A Promise that resolves to staking information
   */
  async getStakingInfo(address: string): Promise<StakingInfo> {
    try {
      // Validate address
      this.validatePolkadotAddress(address);

      // Get staking information
      const stakingInfo = await this.api.derive.staking.account(address);

      // Format results
      const result: StakingInfo = {
        totalStake: stakingInfo.stakingLedger.total.toString(),
        ownStake: stakingInfo.stakingLedger.active.toString(),
        rewardDestination: stakingInfo.rewardDestination.toString(),
        nominators: [],
        validators: []
      };

      // Get nominator info if available
      if (stakingInfo.nominators) {
        for (const nominator of stakingInfo.nominators) {
          result.nominators.push({
            address: nominator.toString(),
            value: '0' // Need to fetch actual value separately
          });
        }
      }

      // Get validator info if available
      if (address in await this.api.query.staking.validators.entries()) {
        const validatorInfo = await this.api.query.staking.validators(address);
        result.validators.push({
          address,
          value: stakingInfo.stakingLedger.active.toString(),
          // @ts-ignore - Propriedade não reconhecida pelo TypeScript
          commission: validatorInfo.commission.toString()
        });
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get staking info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get metadata for a specific pallet
   * @param palletName The name of the pallet
   * @returns A Promise that resolves to pallet metadata
   */
  async getPalletMetadata(palletName: string): Promise<any> {
    try {
      const metadata = this.api.runtimeMetadata;
      const palletIndex = metadata.asLatest.pallets.findIndex(
        p => p.name.toString() === palletName
      );

      if (palletIndex === -1) {
        throw new Error(`Pallet not found: ${palletName}`);
      }

      const pallet = metadata.asLatest.pallets[palletIndex];

      return {
        name: pallet.name.toString(),
        index: palletIndex,
        calls: pallet.calls ? this.api.tx[palletName] : [],
        constants: this.api.consts[palletName],
        storage: this.api.query[palletName],
        errors: this.api.errors[palletName]
      };
    } catch (error) {
      logger.error(`Failed to get pallet metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if an address is valid for the current network
   * @param address The address to check
   * @returns True if the address is valid, false otherwise
   */
  public static validatePolkadotAddress(address: string): boolean {
    try {
      decodeAddress(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the first wallet address (for example purposes)
   * @returns A Promise that resolves to the first wallet address or null if none found
   */
  public async getFirstWalletAddress(): Promise<string | null> {
    try {
      const pairs = this._keyring.getPairs();
      if (pairs.length > 0) {
        return pairs[0].address;
      }

      // If no wallets found, create a temporary one
      const tempAccount = await this.createAccount();
      return tempAccount.address;
    } catch (error) {
      logger.error(`Failed to get first wallet address: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract balance change and fee from a transaction
   * @param txHash The transaction hash
   * @param address The account address
   * @returns A Promise that resolves to balance change and fee
   */
  async extractBalanceChangeAndFee(
    txHash: string,
    _address: string
  ): Promise<{ balanceChange: number; fee: number }> {
    try {
      // Get transaction details
      const txDetails = await this.getTransaction(txHash);

      if (!txDetails) {
        throw new Error(`Transaction not found: ${txHash}`);
      }

      // Get fee if available
      const fee = txDetails.fee || 0;

      // Calculate balance change (would require looking at events)
      // This is a simplified implementation
      let balanceChange = 0;

      return { balanceChange, fee };
    } catch (error) {
      logger.error(`Failed to extract balance change and fee: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add a wallet from a private key or mnemonic
   * @param privateKey The private key or mnemonic to add
   * @returns A Promise that resolves to the keyring pair and address
   */
  async addWalletFromPrivateKey(privateKey: string) {
    try {
      // Try adding the wallet in different formats
      let keyPair;
      
      try {
        // Try as URI (seed/private key)
        keyPair = this._keyring.addFromUri(privateKey);
      } catch (e) {
        // If that fails, try as mnemonic
        try {
          keyPair = this._keyring.addFromMnemonic(privateKey);
        } catch (e2) {
          throw new Error(`Unable to add wallet: ${e2.message}`);
        }
      }
      
      // Format the address in SS58 format for the current network
      const formattedAddress = encodeAddress(
        keyPair.publicKey, 
        this.config.network.ss58Format
      );
      
      // Return the formatted address along with the keyring pair
      return { 
        keyPair,
        address: formattedAddress
      };
    } catch (error) {
      logger.error(`Failed to add wallet from private key: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a wallet's public key in hex format
   * @param keyPair The keyring pair
   * @returns The public key in hex format
   */
  getPublicKeyHex(keyPair: KeyringPair): string {
    return u8aToHex(keyPair.publicKey);
  }

  /**
   * Save wallet to file system
   * @param address The SS58-encoded address
   * @param encryptedPrivateKey The encrypted private key
   * @returns A Promise that resolves when the wallet is saved
   */
  async saveWalletToFile(address: string, encryptedPrivateKey: string): Promise<void> {
    try {
      // File path follows pattern: conf/wallets/polkadot/<address>.json
      const walletPath = `conf/wallets/polkadot`;
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(walletPath)) {
        fs.mkdirSync(walletPath, { recursive: true });
      }

      // Write the encrypted private key to the file
      fs.writeFileSync(`${walletPath}/${address}.json`, encryptedPrivateKey);
      
      logger.info(`Wallet saved successfully: ${address}`);
    } catch (error) {
      logger.error(`Failed to save wallet to file: ${error.message}`);
      throw error;
    }
  }
}


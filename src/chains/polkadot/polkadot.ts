import {ApiPromise, HttpProvider, WsProvider} from '@polkadot/api';
import {Keyring} from '@polkadot/keyring';
import {KeyringPair} from '@polkadot/keyring/types';
import {SubmittableExtrinsic} from '@polkadot/api/types';
import {ISubmittableResult} from '@polkadot/types/types';
import {cryptoWaitReady, decodeAddress, mnemonicGenerate} from '@polkadot/util-crypto';
import {u8aToHex} from '@polkadot/util';
import {TokenInfo} from '../ethereum/ethereum-base';
import {Config, getPolkadotConfig} from './polkadot.config';
import {HttpException} from '../../services/error-handler';
import {logger} from '../../services/logger';
import {TokenListType, walletPath} from '../../services/base';
import {
  FeeEstimate,
  PolkadotAccount,
  SubmittableTransaction,
  TransactionReceipt,
  TransactionStatus,
  TransferOptions,
} from './polkadot.types';
import {BN} from 'bn.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import axios from 'axios';
import {ConfigManagerCertPassphrase} from '../../services/config-manager-cert-passphrase';
import {runWithRetryAndTimeout} from "../../connectors/hydration/hydration.utils";

/**
 * Main class for interacting with the Polkadot blockchain.
 */
export class Polkadot {
  public wsProvider: WsProvider;
  public httpProvider: HttpProvider;
  public apiPromise: ApiPromise;
  public network: string;
  public chain: string = 'polkadot';
  public nativeTokenSymbol: string;
  public tokenList: TokenInfo[] = [];
  public config: Config;
  private _tokenMap: Record<string, TokenInfo> = {};
  private _keyring: Keyring;

  private static _instances: { [name: string]: Polkadot } = {};

  /**
   * Private constructor - use getInstance instead
   * @param network The network to connect to
   */
  private constructor(network: string) {
    this.network = network;
    this.config = getPolkadotConfig('polkadot', network);
    this.nativeTokenSymbol = this.config.network.nativeCurrencySymbol;

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
      await this.utilCryptoWaitReady();

      // Initialize keyring
      this._keyring = new Keyring({
        type: 'sr25519',
      });

      (await this.getApiPromise()).isReady;

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
    tokenListType?: TokenListType,
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
    tokenListType: TokenListType,
  ): Promise<void> {
    try {
      // Clear existing token lists
      this.tokenList = [];
      this._tokenMap = {};

      // Load tokens from source
      let tokensData: any[] = [];

      if (tokenListType === 'URL') {
        const response = await this.axiosGet(tokenListSource);
        tokensData = response.data || [];
      } else {
        const fileContent = await this.fsReadFile(tokenListSource, {
          encoding: 'utf8',
        });
        const data = fileContent.toString();
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
          chainId: 0,
        };

        this.tokenList.push(token);
        this._tokenMap[token.symbol.toLowerCase()] = token;
        this._tokenMap[token.address.toLowerCase()] = token;
      }

      logger.info(
        `Loaded ${this.tokenList.length} tokens for network: ${this.network}`,
      );
    } catch (error) {
      logger.error(`Failed to load tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get token information by symbol
   * @param symbol The token symbol
   * @returns A Promise that resolves to token information or undefined if not found
   */
  async getToken(symbol: string): Promise<TokenInfo | undefined> {
    return this.tokenList.find(token => token.symbol.toLowerCase() === symbol.toLowerCase());
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
        keyringPair,
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
      logger.error(
        `Failed to get keyring pair from private key: ${error.message}`,
      );
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
      const existingPair = this._keyring
        .getPairs()
        .find((pair) => pair.address === address);
      if (existingPair) {
        return existingPair;
      }

      // If not found in memory, load from encrypted file
      try {
        // Path to the wallet file
        const path = `${walletPath}/${this.chain}`;
        const walletFile = `${path}/${address}.json`;

        // Read encrypted mnemonic from file
        const fileContent = await this.fsReadFile(walletFile, 'utf8');
        const encryptedMnemonic = fileContent.toString();

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
          -1,
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
      decodeAddress(address, false);
      return true;
    } catch (error) {
      logger.error(`Invalid Polkadot address: ${address}`);
      throw new HttpException(400, `Invalid Polkadot address: ${address}`, -1);
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
  async getBalance(
    wallet: KeyringPair,
    symbols?: string[],
  ): Promise<Record<string, number>> {
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
      const nativeToken = tokensToCheck.find(
        (t) => t.symbol === this.nativeTokenSymbol,
      );

      if (nativeToken) {
        // TODO: Verify if this method needs externalization!!!
        const accountInfo = await this.apiPromiseQuerySystemAccount(await this.getApiPromise(), address);
        // @ts-ignore - Handle type issues with accountInfo structure
        const freeBalance = accountInfo.data.balance || accountInfo.data.free.toString();
        // @ts-ignore - Handle type issues with accountInfo structure
        const reservedBalance = accountInfo.data.reserved.toString();
        const totalBalance = new BN(freeBalance).add(new BN(reservedBalance));

        balances[nativeToken.symbol] = this.fromBaseUnits(
          totalBalance.toString(),
          nativeToken.decimals,
        );
      }

      // Get balances for other tokens
      for (const token of tokensToCheck) {
        // Skip native token as we already processed it
        if (token.symbol === this.nativeTokenSymbol) continue;
        try {
          // Check if tokens module exists
          if ((await this.getApiPromise()).query.tokens && (await this.getApiPromise()).query.tokens.accounts) {
            const assetBalance = await this.apiPromiseQueryTokensAccounts(await this.getApiPromise(), address, token.address);
            if (assetBalance) {
              const free = assetBalance.free?.toString() || '0';
              balances[token.symbol] = this.fromBaseUnits(free, token.decimals);
            } else {
              balances[token.symbol] = 0;
            }
          } else if ((await this.getApiPromise()).query.assets && (await this.getApiPromise()).query.assets.account) {
            // Alternative assets pallet approach if available
            const assetBalance = await this.apiPromiseQueryAssetsAccount(
              (await this.getApiPromise()),
              token.address,
              address,
            );
            if (assetBalance && !assetBalance.isEmpty) {
              // Handle Option<AssetBalance> - use type-safe methods instead of isSome/unwrap
              const balanceData = assetBalance as any;
              const balance =
                balanceData.balance?.toString() ||
                (balanceData.toJSON && balanceData.toJSON().balance) ||
                '0';
              balances[token.symbol] = this.fromBaseUnits(
                balance,
                token.decimals,
              );
            } else {
              balances[token.symbol] = 0;
            }
          } else {
            // If no token module is available, set balance to 0
            balances[token.symbol] = 0;
          }
        } catch (err) {
          logger.warn(
            `Error getting balance for token ${token.symbol}: ${err.message}`,
          );
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
      const fractionalPart =
        parts.length > 1
          ? parts[1].padEnd(decimals, '0').slice(0, decimals)
          : '0'.repeat(decimals);

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
            this.config.network.transactionURL,
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
   * Get the current block number
   * @returns A Promise that resolves to the current block number
   */

  async getCurrentBlockNumber(): Promise<number> {
    try {
      const header = await this.apiPromiseRpcChainGetHeader(await this.getApiPromise());
      return header.number.toNumber();
    } catch (error) {
      logger.error(`Failed to get current block number: ${error.message}`);
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
   * Get tokens by symbols or return all tokens if no symbols specified
   * @param tokenSymbols Optional token symbols to filter
   * @returns A Promise that resolves to a list of TokenInfo objects
   */
  async getTokensWithSymbols(tokenSymbols?: string[] | string): Promise<TokenInfo[]> {
    try {
      let tokens: TokenInfo[] = [];

      if (!tokenSymbols) {
        tokens = this.tokenList;
      } else {
        const symbolsArray = Array.isArray(tokenSymbols)
            ? tokenSymbols
            : typeof tokenSymbols === 'string'
                ? tokenSymbols.replace(/[\[\]]/g, '').split(',')
                : [];

        for (const symbol of symbolsArray) {
          const token = await this.getToken(symbol.trim());
          if (token) tokens.push(token);
        }
      }

      return tokens;
    } catch (error) {
      logger.error(`Error getting tokens: ${error.message}`);
      throw new HttpException(500, `Failed to get tokens: ${error.message}`, -1);
    }
  }

  /**
   * Estimate gas (fees) for a transaction
   * @param sender The sender keyring pair
   * @param recipient The recipient address
   * @param amount The amount to transfer
   * @param symbol The token symbol
   * @returns A Promise that resolves to the estimated gas as a string
   */
  async estimateGas(
      sender: KeyringPair,
      recipient: string,
      amount: number,
      symbol: string
  ): Promise<string> {
    try {
      const token = await this.getToken(symbol);
      if (!token) {
        throw new Error(`Token not found: ${symbol}`);
      }

      const amountInBaseUnits = this.toBaseUnits(amount, token.decimals);

      // Create transaction for estimation without signing
      const apiPromise = await this.getApiPromise();
      const transferTx = apiPromise.tx.balances.transfer(recipient, amountInBaseUnits);

      // Get fee estimate
      const info = await transferTx.paymentInfo(sender);

      // Return estimated fee in human-readable format
      return this.fromBaseUnits(info.partialFee.toString(), token.decimals).toString();
    } catch (error) {
      logger.error(`Failed to estimate gas: ${error.message}`);
      throw error;
    }
  }

  public getHttpProvider(): WsProvider {
    if (!this.httpProvider) {
      this.httpProvider = new HttpProvider(this.config.network.nodeURL);
    }

    return this.wsProvider;
  }

  public getWsProvider(): WsProvider {
    if (!this.wsProvider) {
      this.wsProvider = new WsProvider(this.config.network.nodeURL);
    }

    return this.wsProvider;
  }

  public getProvider(): WsProvider | HttpProvider {
    if (this.config.network.nodeURL.startsWith('http')) {
      return this.getHttpProvider();
    } else {
      return this.getWsProvider();
    }
  }

  public async getApiPromise(): Promise<ApiPromise> {
    if (!this.apiPromise) {
      this.apiPromise = await this.apiPromiseCreate({ provider: this.getProvider() });
    }

    return this.apiPromise;
  }

  @runWithRetryAndTimeout()
  public async apiPromiseCreate(options: any): Promise<ApiPromise> {
    return ApiPromise.create(options);
  }

  @runWithRetryAndTimeout()
  public async utilCryptoWaitReady(): Promise<boolean> {
    return cryptoWaitReady();
  }

  @runWithRetryAndTimeout()
  public async apiPromiseQuerySystemAccount(target: ApiPromise, address: string) {
    return target.query.system.account(address);
  }

  @runWithRetryAndTimeout()
  public async apiPromiseRpcChainGetHeader(target: ApiPromise) {
    return target.rpc.chain.getHeader();
  }

  @runWithRetryAndTimeout()
  public async apiPromiseQueryAssetsAccount(target: ApiPromise, arg1: string, arg2: string) {
    return target.query.assets.account(arg1, arg2);
  }

  @runWithRetryAndTimeout()
  public async apiPromiseQueryTokensAccounts(target: ApiPromise, arg1: string, arg2: string) {
    return target.query.tokens.accounts(arg1, arg2);
  }

  @runWithRetryAndTimeout()
  public async apiPromiseDeriveStakingAccount(target: ApiPromise, address: string) {
    return target.derive.staking.account(address);
  }

  @runWithRetryAndTimeout()
  public async apiPromiseQueryStakingValidatorsEntries(target: ApiPromise) {
    return target.query.staking.validators.entries();
  }

  @runWithRetryAndTimeout()
  public async apiPromiseQueryStakingValidators(target: ApiPromise, address: string) {
    return target.query.staking.validators(address);
  }

  @runWithRetryAndTimeout()
  public async apiPromiseRpcChainGetBlock(target: ApiPromise, blockHash: string) {
    return target.rpc.chain.getBlock(blockHash);
  }

  @runWithRetryAndTimeout()
  public async apiPromiseRuntimeMetadata(target: ApiPromise) {
    return target.runtimeMetadata;
  }

  @runWithRetryAndTimeout()
  public async apiPromiseTx(target: ApiPromise, palletName: string) {
    return target.tx[palletName];
  }

  @runWithRetryAndTimeout()
  public async apiPromiseConsts(target: ApiPromise, palletName: string) {
    return target.consts[palletName];
  }

  @runWithRetryAndTimeout()
  public async apiPromiseQuery(target: ApiPromise, palletName: string) {
    return target.query[palletName];
  }

  @runWithRetryAndTimeout()
  public async apiPromiseErrors(target: ApiPromise, palletName: string) {
    return target.errors[palletName];
  }

  @runWithRetryAndTimeout()
  public async apiPromiseTxBalancesTransfer(target: ApiPromise, recipient: string, amount: string) {
    return target.tx.balances.transfer(recipient, amount);
  }

  @runWithRetryAndTimeout()
  public async apiPromiseTxBalancesTransferKeepAlive(target: ApiPromise, recipient: string, amount: string) {
    return target.tx.balances.transferKeepAlive(recipient, amount);
  }

  @runWithRetryAndTimeout()
  public async submittableExtrinsicPaymentInfo(target: any, sender: KeyringPair) {
    return target.paymentInfo(sender);
  }

  @runWithRetryAndTimeout()
  public async fsReadFile(path: string, options?: { encoding: BufferEncoding } | BufferEncoding): Promise<string | Buffer> {
    return fs.promises.readFile(path, options as any);
  }

  @runWithRetryAndTimeout()
  public async axiosGet(url: string): Promise<any> {
    return axios.get(url);
  }

  @runWithRetryAndTimeout()
  public async axiosPost(url: string, data: any, config?: any): Promise<any> {
    return axios.post(url, data, config);
  }
}

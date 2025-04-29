import {ApiPromise, HttpProvider, WsProvider} from '@polkadot/api';
import {Keyring} from '@polkadot/keyring';
import {KeyringPair} from '@polkadot/keyring/types';
import {cryptoWaitReady, decodeAddress, mnemonicGenerate} from '@polkadot/util-crypto';
import {u8aToHex} from '@polkadot/util';
import {TokenInfo} from '../ethereum/ethereum-base';
import {Config, getPolkadotConfig} from './polkadot.config';
import {HttpException, LOAD_WALLET_ERROR_CODE, LOAD_WALLET_ERROR_MESSAGE} from '../../services/error-handler';
import {logger} from '../../services/logger';
import {TokenListType, walletPath} from '../../services/base';
import {PolkadotAccount} from './polkadot.types';
import {BN} from 'bn.js';
import * as fs from 'fs';
import axios, {Axios} from 'axios';
import {ConfigManagerCertPassphrase} from '../../services/config-manager-cert-passphrase';
import {wrapResponse} from '../../services/response-wrapper';
import {Constant, fromBaseUnits, runWithRetryAndTimeout, sleep, toBaseUnits} from './polkadot.utils';
import {validatePolkadotAddress} from './polkadot.validators';
import * as crypto from 'crypto';
import { BigNumber } from '@galacticcouncil/sdk';

/**
 * Main class for interacting with the Polkadot blockchain.
 * 
 * This class provides methods for account management, balance queries,
 * transaction operations, and network status for Polkadot networks.
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
    if (!network) {
      throw new HttpException(400, 'Network parameter is required', -1);
    }
    
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
    if (!tokenListSource || !tokenListType) {
      tokenListSource = this.config.network.tokenListSource;
      tokenListType = this.config.network.tokenListType;
    }

    await this.loadTokens(tokenListSource, tokenListType);
    return this.tokenList;
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
    // Clear existing token lists
    this.tokenList = [];
    this._tokenMap = {};

    // Load tokens from source
    let tokensData: any[] = [];

    if (tokenListType === 'URL') {
      const response = await this.axiosGet(axios, tokenListSource);
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
  }

  /**
   * Get token information by symbol
   * @param addressOrSymbol The token symbol
   * @returns A Promise that resolves to token information or undefined if not found
   */
  getToken(addressOrSymbol: string): TokenInfo | undefined {
    return this.tokenList.find(token =>
        token.symbol.toLowerCase() === addressOrSymbol.toLowerCase()
        || token.address.toLowerCase() === addressOrSymbol.toLowerCase()
    );
  }

  /**
   * Get the native token
   * @returns A Promise that resolves to the native token
   */
  public getNativeToken(): TokenInfo {
    return this.getToken(this.config.network.nativeCurrencySymbol);
  }

  /**
   * Get the fee payment currency
   * @returns A Promise that resolves to the fee payment currency
   */
  public getFeePaymentToken(): TokenInfo {
    return this.getToken(this.config.network.feePaymentCurrencySymbol);
  }

  /**
   * Create a new account with a generated mnemonic
   * @returns A Promise that resolves to a new account
   */
  async createAccount(): Promise<PolkadotAccount> {
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
  }

  /**
   * Get a keyring pair from a private key
   * @param seed The private key in mnemonic format
   * @returns The keyring pair
   */
  getKeyringPairFromMnemonic(seed: string): KeyringPair {
    return this._keyring.addFromMnemonic(seed);
  }

  /**
   * Get a wallet from an address (loads from encrypted file)
   * @param address The address of the wallet
   * @returns A Promise that resolves to the keyring pair
   */
  async getWallet(address: string): Promise<KeyringPair> {
    // Check if address is valid
    validatePolkadotAddress(address);

    // Look for existing pair with this address
    const existingPair = this._keyring
      .getPairs()
      .find((pair) => pair.address === address);
    if (existingPair) {
      return existingPair;
    }

    // If not found in memory, load from encrypted file
    // Path to the wallet file
    const path = `${walletPath}/${this.chain}`;
    const walletFile = `${path}/${address}.json`;

    try {
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
  }

  /**
   * Encrypts a secret (mnemonic or private key) with a password
   * @param secret The secret to encrypt
   * @param password The password to encrypt with
   * @returns The encrypted secret string
   */
  public async encrypt(secret: string, password: string): Promise<string> {
    const key = crypto.createHash('sha256').update(password).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', new Uint8Array(key), new Uint8Array(iv));

    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts an encrypted secret
   * @param encryptedSecret The encrypted secret
   * @param password The password to decrypt with
   * @returns The decrypted secret
   */
  public async decrypt(encryptedSecret: string, password: string): Promise<string> {
    try {
      const [ivHex, encryptedText] = encryptedSecret.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.createHash('sha256').update(password).digest();

      const decipher = crypto.createDecipheriv('aes-256-gcm', new Uint8Array(key), new Uint8Array(iv));
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');

      return decrypted;
    } catch (error) {
      logger.error(`Failed to decrypt secret: ${error.message}`);
      throw new HttpException(500, 'Failed to decrypt wallet data', -1);
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
    const balances: Record<string, number> = {};
    const address = wallet.address;

    // Determine which tokens to check
    let tokensToCheck: TokenInfo[] = [];
    if (symbols && symbols.length > 0) {
      // Filter tokens by specified symbols
      for (const symbol of symbols) {
        const token = this.getToken(symbol);
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
      const accountInfo = await this.apiPromiseQuerySystemAccount(await this.getApiPromise(), address);
      // Handle different account data structures safely
      let freeBalance = '0';
      let reservedBalance = '0';
      
      if (accountInfo && accountInfo.data) {
        // Try to get free balance from different possible structures
        if (accountInfo.data.free) {
          freeBalance = accountInfo.data.free.toString();
        }
        
        // Get reserved balance if available
        if (accountInfo.data.reserved) {
          reservedBalance = accountInfo.data.reserved.toString();
        }
      }
      
      const totalBalance = new BN(freeBalance).add(new BN(reservedBalance));

      balances[nativeToken.symbol] = fromBaseUnits(
        totalBalance.toString(),
        nativeToken.decimals,
      );
    }

    // Get balances for other tokens
    for (const token of tokensToCheck) {
      // Skip native token as we already processed it
      if (token.symbol === this.nativeTokenSymbol) continue;
      
      // Check if tokens module exists
      const apiPromise = await this.getApiPromise();
      if (apiPromise.query.tokens && apiPromise.query.tokens.accounts) {
        const assetBalance = await this.apiPromiseQueryTokensAccounts(apiPromise, address, token.address);
        if (assetBalance) {
          const free = assetBalance.free?.toString() || '0';
          balances[token.symbol] = fromBaseUnits(free, token.decimals);
        } else {
          balances[token.symbol] = 0;
        }
      } else if (apiPromise.query.assets && apiPromise.query.assets.account) {
        // Alternative assets pallet approach if available
        const assetBalance = await this.apiPromiseQueryAssetsAccount(
          apiPromise,
          token.address,
          address,
        );
        if (assetBalance && !assetBalance.isEmpty) {
          // Handle Option<AssetBalance> - use type-safe methods
          const balanceData = assetBalance as any;
          const balance =
            balanceData.balance?.toString() ||
            (balanceData.toJSON && balanceData.toJSON().balance) ||
            '0';
          balances[token.symbol] = fromBaseUnits(
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
    }

    return balances;
  }

  /**
   * Get transaction details by hash
   * @param txHash The transaction hash
   * @returns A Promise that resolves to transaction details
   */
  public async getTransaction(txHash: string, waitForFee: boolean = false, waitForTransfers: boolean = false): Promise<any> {
    const startTime = Date.now();

    try {
      const feePaymentToken = this.getFeePaymentToken();

      const currentBlock = await this.getCurrentBlockNumber();
      
      // Initialize default values
      let txData = null;
      let txStatus = 0; // Not found by default
      let blockNum = null;
      let fee = null;
      let transfers = null;
      
      // Keep polling until we find a fee or reach timeout
      // noinspection PointlessBooleanExpressionJS
      while (Date.now() - startTime < 1000 * Constant.defaultTimeout.getValueAs<number>()) {
        try {
          const headers = { 'Content-Type': 'application/json' };
          const body = { hash: txHash };
          
          const response = await this.axiosPost(
              axios,
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
                ? parseFloat(transaction.fee) / Math.pow(10, feePaymentToken.decimals)
                : null;

            transfers = transaction.transfers;
            
            // Determine status based on success and finalized flags
            if (transaction.success) {
              txStatus = 1; // Success
            } else if (transaction.success === false) {
              txStatus = -1; // Failed
            } else if (transaction.finalized) {
              txStatus = 1; // Success if finalized
            }

            if (waitForFee) {
              if (waitForTransfers) {
                if (transfers) {
                  break;
                }
              } else {
                if (fee) {
                  break;
                }
              }
            } else {
              break;
            }
          }
        } catch (error) {
          logger.error(`Error fetching transaction ${txHash}: ${error.message}`);
        }
        
        // Wait a bit before polling again
        await sleep(1000 * Constant.defaultDelayBetweenRetries.getValueAs<number>());
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
    const header = await this.apiPromiseRpcChainGetHeader(await this.getApiPromise());
    return header.number.toNumber();
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
    const pairs = this._keyring.getPairs();
    if (pairs.length > 0) {
      return pairs[0].address;
    }

    // If no wallets found, create a temporary one
    const tempAccount = await this.createAccount();
    return tempAccount.address;
  }

  /**
   * Get tokens by symbols or return all tokens if no symbols specified
   * @param tokenSymbols Optional token symbols to filter
   * @returns A Promise that resolves to a list of TokenInfo objects
   */
  async getTokensWithSymbols(tokenSymbols?: string[] | string): Promise<TokenInfo[]> {
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
        const token = this.getToken(symbol.trim());
        if (token) tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * Get balances for a specific address
   * @param address The address to check balances for
   * @param tokenSymbols Optional list of token symbols to filter
   * @returns A Promise that resolves to the balance response
   */
  async getAddressBalances(address: string, tokenSymbols?: string[]): Promise<any> {
    const initTime = Date.now();

    let wallet;
    try {
      wallet = await this.getWallet(address);
    } catch (err) {
      throw new HttpException(
          500,
          LOAD_WALLET_ERROR_MESSAGE + err,
          LOAD_WALLET_ERROR_CODE
      );
    }

    const balances = await this.getBalance(wallet, tokenSymbols);
    return wrapResponse({ balances }, initTime);
  }

  /**
   * Estimate gas for a transaction
   * @param gasLimit Optional gas limit for the transaction
   * @param address Optional address to use for fee estimation
   * @returns A Promise that resolves to the gas estimation
   */
  async estimateTransactionGas(gasLimit?: number): Promise<any> {
    const api = await this.getApiPromise();

    const feePaymentToken = this.getFeePaymentToken();
    
    // Get the current block header to get the block hash
    const header = await api.rpc.chain.getHeader();
    
    // Get the runtime version to ensure we have the correct metadata
    const runtimeVersion = await api.rpc.state.getRuntimeVersion();
    
    // Create a sample transfer transaction to estimate base fees
    const transferTx = api.tx.system.remark('0x00');
    
    const feeAddress = await this.getFirstWalletAddress();
    
    // Get the payment info for the transaction
    const paymentInfo = await transferTx.paymentInfo(feeAddress);
    
    // Convert the fee to human readable format (HDX)
    const fee = new BigNumber(paymentInfo.partialFee.toString()).div(new BigNumber(10).pow(feePaymentToken.decimals));
    
    // Calculate gas price based on fee and gas limit
    const calculatedGasLimit = new BigNumber(gasLimit.toString());
    const gasPrice = fee.dividedBy(calculatedGasLimit);
    
    return {
      gasPrice: gasPrice.toNumber(),
      gasPriceToken: feePaymentToken.symbol,
      gasLimit: calculatedGasLimit.toNumber(),
      gasCost: fee.toNumber()
    };
  }

  /**
   * Poll for transaction status
   * @param txHash The transaction hash to poll
   * @returns A Promise that resolves to the transaction status
   */
  async pollTransaction(txHash: string): Promise<any> {
    const txResult = await this.getTransaction(txHash);

    return {
      currentBlock: await this.getCurrentBlockNumber(),
      txHash,
      txBlock: txResult.txBlock,
      txStatus: txResult.txStatus,
      txData: txResult.txData,
      fee: txResult.fee
    };
  }

  /**
   * Get network status information
   * @returns A Promise that resolves to the network status
   */
  async getNetworkStatus(): Promise<any> {
    const initTime = Date.now();

    const chain = 'polkadot';
    const network = this.network;
    const rpcUrl = this.config.network.nodeURL;
    const nativeCurrency = this.config.network.nativeCurrencySymbol;
    const currentBlockNumber = await this.getCurrentBlockNumber();

    return wrapResponse({
      chain,
      network,
      rpcUrl,
      currentBlockNumber,
      nativeCurrency
    }, initTime);
  }

  /**
   * Gets the HTTP provider for the Polkadot node
   */
  public getHttpProvider(): WsProvider {
    if (!this.httpProvider) {
      this.httpProvider = new HttpProvider(this.config.network.nodeURL);
    }

    return this.wsProvider;
  }

  /**
   * Gets the WebSocket provider for the Polkadot node
   */
  public getWsProvider(): WsProvider {
    if (!this.wsProvider) {
      this.wsProvider = new WsProvider(this.config.network.nodeURL);
    }

    return this.wsProvider;
  }

  /**
   * Gets the appropriate provider based on the node URL
   */
  public getProvider(): WsProvider | HttpProvider {
    if (this.config.network.nodeURL.startsWith('http')) {
      return this.getHttpProvider();
    } else {
      return this.getWsProvider();
    }
  }

  /**
   * Gets the ApiPromise instance, creating it if necessary
   */
  public async getApiPromise(): Promise<ApiPromise> {
    if (!this.apiPromise) {
      this.apiPromise = await this.apiPromiseCreate({ provider: this.getProvider() });
    }

    return this.apiPromise;
  }

  // Externalized methods with retry/timeout below - must be maintained as is

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
  public async axiosGet(target: Axios, url: string): Promise<any> {
    return target.get(url);
  }

  @runWithRetryAndTimeout()
  public async axiosPost(target: Axios, url: string, data: any, config?: any): Promise<any> {
    return target.post(url, data, config);
  }
}

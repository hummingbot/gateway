import { Config, getCardanoConfig } from './cardano.config';
import { Lucid, Blockfrost, C, UTxO } from '@aiquant/lucid-cardano';
import { TokenListType, TokenValue } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { walletPath } from '../../wallet/utils';
import { promises as fs } from 'fs';
import fse from 'fs-extra';
import crypto from 'crypto';
import {
  NETWORK_ERROR_CODE,
  NETWORK_ERROR_MESSAGE,
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
  TransactionStatus,
} from './cardano.utils';
import { logger } from '../../services/logger';
import { TokenListResolutionStrategy } from '../../services/token-list-resolution';

//import { Cardanoish } from "../../services/common-interfaces";
export type CardanoTokenInfo = {
  policyId: string;
  assetName: string;
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string;
  address: string;
};

export class Cardano {
  private static _instances: { [name: string]: Cardano };
  public tokenList: CardanoTokenInfo[] = [];
  public config: Config;
  public tokenMap: Record<string, CardanoTokenInfo> = {};
  private _tokenListSource: string;
  private _tokenListType: TokenListType;
  public lucidInstance: Lucid | null = null;
  public network: string;
  private _chain: string;
  private _ready: boolean = false;
  public apiURL: any;
  public nativeTokenSymbol: string;
  public projectId: string;

  private constructor(network: string) {
    // Throw error if network is not 'mainnet' or 'preprod'
    if (
      network !== 'mainnet' &&
      network !== 'preprod' &&
      network !== 'preview'
    ) {
      throw new HttpException(503, NETWORK_ERROR_MESSAGE, NETWORK_ERROR_CODE);
    }
    this.config = getCardanoConfig('cardano', network);
    this._chain = 'cardano';
    // Determine the appropriate Blockfrost Project ID and API URL
    this.apiURL = this.config.network.apiurl;
    this.network = this.config.network.name;
    this.nativeTokenSymbol = this.config.network.nativeCurrencySymbol;
    this._tokenListSource = this.config.network.tokenListSource;
    this._tokenListType = <TokenListType>this.config.network.tokenListType;
    this.projectId = this.config.network.projectId;
  }
  public static async getInstance(network: string): Promise<Cardano> {
    if (Cardano._instances === undefined) {
      Cardano._instances = {};
    }

    if (!Cardano._instances[network]) {
      const instance = new Cardano(network);

      if (
        instance.projectId &&
        instance.projectId.toLowerCase().startsWith(network.toLowerCase())
      ) {
        try {
          await instance.init();
        } catch (err: any) {
          logger.warn(
            `[Cardano] initial init() skipped for network="${network}": ${err.message}`,
          );
        }
      } else {
        logger.info(
          `[Cardano] skipped init() for network="${network}" because projectId is still placeholder`,
        );
      }

      Cardano._instances[network] = instance;
    }

    return Cardano._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Cardano } {
    return Cardano._instances;
  }

  public get chain(): string {
    return this._chain;
  }

  public ready(): boolean {
    return this._ready;
  }

  public async init(): Promise<void> {
    if (!this.lucidInstance) {
      this.lucidInstance = await Lucid.new(
        new Blockfrost(this.apiURL, this.projectId),
        this.network === 'preprod'
          ? 'Preprod'
          : this.network === 'preview'
            ? 'Preview'
            : 'Mainnet',
      );
    }

    if (!this._ready) {
      // Ensure we only set ready once
      this._ready = true;
      await this.loadTokens(this._tokenListSource, this._tokenListType);
    }
  }

  private getLucid(): Lucid {
    if (!this.lucidInstance) {
      // Use instance-specific Lucid
      throw new Error('Lucid is not initialized. Call `init` first.');
    }
    return this.lucidInstance;
  }

  public async getWalletFromPrivateKey(privateKey: string): Promise<{
    address: string;
  }> {
    if (!this._ready) {
      throw new Error(
        'Cardano instance is not initialized. Call `init` first.',
      );
    }

    try {
      const lucid = this.getLucid();
      lucid.selectWalletFromPrivateKey(privateKey);

      // Get wallet address
      const address = await lucid.wallet.address();
      return { address };
    } catch (error: any) {
      throw new Error(
        `Error retrieving wallet from private key: ${error.message}`,
      );
    }
  }

  public async getWalletFromAddress(address: string): Promise<string> {
    const path = `${walletPath}/${this._chain}`;
    const encryptedPrivateKey: string = await fse.readFile(
      `${path}/${address}.json`,
      'utf8',
    );
    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }

    // Ensure decrypt is awaited if it's asynchronous
    const privateKey = await this.decrypt(encryptedPrivateKey, passphrase);

    return privateKey; // Correctly resolved the Promise<string> to string
  }
  // get native balance ADA
  public async getNativeBalance(privateKey: string): Promise<string> {
    const Lucid = this.getLucid();
    Lucid.selectWalletFromPrivateKey(privateKey);

    // Get wallet address
    const address = await Lucid.wallet.address();
    // Fetch UTXOs at the wallet's address
    const utxos = await Lucid.utxosAt(address);

    // Calculate total balance in ADA using BigInt
    const totalLovelace = utxos.reduce(
      (acc, utxo) => acc + (utxo.assets.lovelace || 0n),
      0n,
    );

    // Convert Lovelace (BigInt) to ADA (Number)
    const balanceInADA = Number(totalLovelace) / 1_000_000;

    return balanceInADA.toString();
  }
  // get Asset balance like MIN and LP
  async getAssetBalance(
    privateKey: string,
    token: CardanoTokenInfo,
  ): Promise<string> {
    let tokenAdress: string;

    // If token information is not found, throw an error
    if (!token || Object.keys(token).length === 0) {
      throw new Error(`Token ${token} is not supported.`);
    }

    tokenAdress = token.policyId + token.assetName;

    const Lucid = this.getLucid();
    Lucid.selectWalletFromPrivateKey(privateKey);

    // Get wallet address
    const address = await Lucid.wallet.address();

    // Fetch UTXOs at the wallet's address
    const utxos = await Lucid.utxosAt(address);

    // Calculate token balance
    const calculatedTokenBalance = utxos.reduce((acc, utxo) => {
      if (utxo.assets[tokenAdress]) {
        return acc + Number(utxo.assets[tokenAdress]);
      }
      return acc;
    }, 0);
    // Divide raw balance by 10^decimals to get the actual amount
    const decimals = token.decimals;
    const actualTokenBalance = calculatedTokenBalance / Math.pow(10, decimals);
    logger.debug(
      `Token balance for ${address}: ${actualTokenBalance.toString()}`,
    );
    return actualTokenBalance.toString();
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

  async getCurrentBlockNumber(): Promise<number> {
    const response = await fetch(`${this.apiURL}/blocks/latest`, {
      headers: {
        project_id: this.projectId,
      },
    });

    if (!response.ok) {
      throw new Error(`Error fetching latest block: ${response.statusText}`);
    }

    const latestBlock = await response.json();
    return latestBlock.height;
  }

  public async getTransaction(txHash: string): Promise<TransactionStatus> {
    try {
      // Fetch transaction details from Blockfrost
      const response = await fetch(`${this.apiURL}/txs/${txHash}`, {
        method: 'GET',
        headers: {
          project_id: this.projectId, // Pass project ID in the header
        },
      });

      // Check if the response is successful
      if (!response.ok) {
        throw new Error(`Failed to fetch transaction: ${response.statusText}`);
      }

      // Parse the response JSON
      const tx = await response.json();

      // Simplify the response for the bot
      return {
        txHash: tx.hash,
        block: tx.block,
        blockHeight: tx.block_height,
        blockTime: tx.block_time,
        fees: Number(tx.fees),
        validContract: tx.valid_contract,
        status: tx.block ? 1 : 0, // Simplified status
      };
    } catch (error) {
      console.error(`Error fetching transaction: ${error}`);
      throw error;
    }
  }

  /**
   * Load tokens from the token list source
   */
  public async loadTokens(
    tokenListSource: string,
    tokenListType: TokenListType,
  ): Promise<void> {
    logger.info(
      `Loading tokens for cardano from ${tokenListType} source: ${tokenListSource}`,
    );
    try {
      this.tokenList = await this.getTokenList(tokenListSource, tokenListType);

      if (this.tokenList) {
        logger.info(`Loaded ${this.tokenList.length} tokens for cardano`);
        // Build token map for faster lookups
        this.tokenList.forEach(
          (token: CardanoTokenInfo) => (this.tokenMap[token.symbol] = token),
        );
      }
    } catch (error) {
      logger.error(`Failed to load token list: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get token list from source
   */
  private async getTokenList(
    tokenListSource: string,
    tokenListType: TokenListType,
  ): Promise<CardanoTokenInfo[]> {
    const tokensList = await new TokenListResolutionStrategy(
      tokenListSource,
      tokenListType,
    ).resolve();

    // Normalize addresses
    return tokensList.tokens;
  }

  public get storedTokenList(): CardanoTokenInfo[] {
    return this.tokenList;
  }

  /**
   * Get token info by symbol or address
   */
  public getTokenBySymbol(tokenSymbol: string): CardanoTokenInfo | undefined {
    // First try to find token by symbol
    const tokenBySymbol = this.tokenList.find(
      (token: CardanoTokenInfo) =>
        token.symbol.toUpperCase() === tokenSymbol.toUpperCase(),
    );

    if (tokenBySymbol) {
      return tokenBySymbol;
    }
  }

  public getTokenAddress(symbol: string): string {
    let tokenAddress: string = '';
    let tokenInfo = this.getTokenBySymbol(symbol);
    // If token information is not found, throw an error
    if (!tokenInfo || Object.keys(tokenInfo).length === 0) {
      // Handle token not supported errors
      throw new HttpException(
        500,
        TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
        TOKEN_NOT_SUPPORTED_ERROR_CODE,
      );
    }

    tokenAddress = tokenInfo[0]?.policyId + tokenInfo[0]?.assetName;

    return tokenAddress;
  }

  /**
   * Get the first available Cardano wallet address
   */
  public async getFirstWalletAddress(): Promise<string | null> {
    // Specifically look in the cardano subdirectory, not in any other chain's directory
    const path = `${walletPath}/cardano`;
    try {
      // Create directory if it doesn't exist
      await fse.ensureDir(path);

      // Get all .json files in the directory
      const files = await fse.readdir(path);
      const walletFiles = files.filter((f) => f.endsWith('.json'));

      if (walletFiles.length === 0) {
        return null;
      }

      // Return first wallet address (without .json extension)
      const walletAddress = walletFiles[0].slice(0, -5);

      // Validate it looks like an Cardano address
      if (!walletAddress.startsWith('addr')) {
        logger.warn(
          `Invalid Cardano address found in wallet directory: ${walletAddress}`,
        );
        return null;
      }

      return walletAddress;
    } catch (error) {
      logger.error(`Error getting Cardano wallet address: ${error.message}`);
      return null;
    }
  }

  /**
   * Given a payment address, load its private key & select that
   * wallet in Lucid, then return all UTxOs at that address.
   */
  public async getUtxos(address: string): Promise<UTxO[]> {
    try {
      // 1) derive the private key from your store (e.g. DB or seed)
      const privateKey = await this.getWalletFromAddress(address);
      if (!privateKey) {
        throw new Error(`No private key found for address ${address}`);
      }

      // 2) tell Lucid to use that key for signing / UTxO queries
      this.lucidInstance.selectWalletFromPrivateKey(privateKey);

      // 3) fetch & return UTxOs
      const utxos: UTxO[] = await this.lucidInstance.utxosAt(address);
      return utxos;
    } catch (error: any) {
      // 4) log the failure for debugging
      logger.error(
        `Cardano.getUtxos failed for address ${address}: ${error.message || error}`,
      );
      // 5) rethrow a trimmed error
      throw new Error(
        `Unable to fetch UTxOs for ${address}: ${error.message || error}`,
      );
    }
  }

  /**
   * Validate Cardano address format
   * @param address The address to validate
   * @returns The address if valid
   * @throws Error if the address is invalid
   */
  public static validateAddress(address: string): string {
    try {
      const cardanoAddressRegex = /^(addr|addr_test)[0-9a-zA-Z]{1,}$/;

      // Additional check for proper length
      if (!cardanoAddressRegex.test(address)) {
        throw new Error('Invalid address length');
      }

      return address;
    } catch (error) {
      throw new Error(`Invalid Cardano address format: ${address}`);
    }
  }

  async close() {
    if (this._chain in Cardano._instances) {
      delete Cardano._instances[this._chain];
    }
  }
}

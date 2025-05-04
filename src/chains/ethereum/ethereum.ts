import {
  BigNumber,
  Contract,
  providers,
  Transaction,
  utils,
  Wallet,
} from 'ethers';
import { TokenListType, TokenValue, walletPath } from '../../services/base';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { getAddress } from 'ethers/lib/utils';
import { TokenListResolutionStrategy } from '../../services/token-list-resolution';
import { getEthereumConfig } from './ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';
import { UniswapConfig } from '../../connectors/uniswap/uniswap.config';

// information about an Ethereum token
export interface TokenInfo {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export type NewBlockHandler = (bn: number) => void;
export type NewDebugMsgHandler = (msg: any) => void;

export class Ethereum {
  private static _instances: { [name: string]: Ethereum };
  public provider: providers.StaticJsonRpcProvider;
  public tokenList: TokenInfo[] = [];
  public tokenMap: Record<string, TokenInfo> = {};
  public network: string;
  public nativeTokenSymbol: string;
  public chainId: number;
  public rpcUrl: string;
  public gasPrice: number;
  public gasLimitTransaction: number;
  public tokenListSource: string;
  public tokenListType: TokenListType;
  private _initialized: boolean = false;

  // For backward compatibility
  public get chain(): string {
    return this.network;
  }

  private constructor(network: string) {
    logger.info(`Initializing Ethereum connector for network: ${network}`);
    const config = getEthereumConfig('ethereum', network);
    
    this.chainId = config.network.chainID;
    this.rpcUrl = config.network.nodeURL;
    this.provider = new providers.StaticJsonRpcProvider(this.rpcUrl);
    this.tokenListSource = config.network.tokenListSource;
    this.tokenListType = config.network.tokenListType;
    this.network = network;
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this.gasPrice = config.manualGasPrice;
    this.gasLimitTransaction = config.gasLimitTransaction;
  }

  public static async getInstance(network: string): Promise<Ethereum> {
    if (!Ethereum._instances) {
      Ethereum._instances = {};
    }
    if (!Ethereum._instances[network]) {
      const instance = new Ethereum(network);
      await instance.init();
      Ethereum._instances[network] = instance;
    }
    return Ethereum._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Ethereum } {
    return Ethereum._instances;
  }

  public onNewBlock(func: NewBlockHandler) {
    this.provider.on('block', func);
  }

  public onDebugMessage(func: NewDebugMsgHandler) {
    this.provider.on('debug', func);
  }

  /**
   * Check if the Ethereum instance is ready
   */
  public ready(): boolean {
    return this._initialized;
  }

  /**
   * Estimates the current gas price
   * Returns the gas price in GWEI
   */
  public async estimateGasPrice(): Promise<number> {
    try {
      const baseFee: BigNumber = await this.provider.getGasPrice();
      let priorityFee: BigNumber = BigNumber.from('0');

      // Only get priority fee for mainnet
      if (this.network === 'mainnet') {
        priorityFee = BigNumber.from(
          await this.provider.send('eth_maxPriorityFeePerGas', [])
        );
      }

      const totalFeeGwei = baseFee.add(priorityFee).toNumber() * 1e-9;
      logger.info(`[GAS PRICE] Estimated: ${totalFeeGwei} GWEI for network ${this.network}`);
      
      return totalFeeGwei;
    } catch (error: any) {
      logger.error(`Failed to estimate gas price: ${error.message}`);
      return this.gasPrice; // Return existing gas price as fallback
    }
  }

  /**
   * Get a contract instance for a token using standard ERC20 interface
   */
  public getContract(
    tokenAddress: string,
    signerOrProvider?: Wallet | Provider,
  ): Contract {
    // Standard ERC20 interface ABI - the minimum needed for our operations
    const erc20Interface = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function totalSupply() view returns (uint256)',
      'function balanceOf(address owner) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)',
      'event Transfer(address indexed from, address indexed to, uint256 amount)',
      'event Approval(address indexed owner, address indexed spender, uint256 amount)'
    ];
    
    return new Contract(tokenAddress, erc20Interface, signerOrProvider || this.provider);
  }

  /**
   * Resolves a spender name to an address
   */
  public getSpender(reqSpender: string): string {
    let spender: string;
    if (reqSpender === 'uniswap') {
      spender = UniswapConfig.config.uniswapV3SmartOrderRouterAddress(
        'ethereum',
        this.network,
      );
    } else {
      spender = reqSpender;
    }
    return spender;
  }

  /**
   * Initialize the Ethereum connector
   */
  public async init(): Promise<void> {
    try {
      await this.loadTokens(this.tokenListSource, this.tokenListType);
      this._initialized = true;
    } catch (e) {
      logger.error(`Failed to initialize Ethereum chain: ${e}`);
      throw e;
    }
  }

  /**
   * Load tokens from the token list source
   */
  public async loadTokens(
    tokenListSource: string,
    tokenListType: TokenListType
  ): Promise<void> {
    logger.info(`Loading tokens for ethereum (${this.chainId}) from ${tokenListType} source: ${tokenListSource}`);
    try {
      this.tokenList = await this.getTokenList(tokenListSource, tokenListType);
      // Only keep tokens in the same chain
      this.tokenList = this.tokenList.filter(
        (token: TokenInfo) => token.chainId === this.chainId
      );
      
      if (this.tokenList) {
        logger.info(`Loaded ${this.tokenList.length} tokens for ethereum`);
        // Build token map for faster lookups
        this.tokenList.forEach(
          (token: TokenInfo) => (this.tokenMap[token.symbol] = token)
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
    tokenListType: TokenListType
  ): Promise<TokenInfo[]> {
    const tokens = await new TokenListResolutionStrategy(
      tokenListSource,
      tokenListType
    ).resolve();
    
    // Normalize addresses
    return tokens.map((token) => {
      token.address = getAddress(token.address);
      return token;
    });
  }

  /**
   * Get all tokens loaded from the token list
   */
  public get storedTokenList(): TokenInfo[] {
    return Object.values(this.tokenMap);
  }

  /**
   * Get token info by symbol
   */
  public getTokenBySymbol(tokenSymbol: string): TokenInfo | undefined {
    return this.tokenList.find(
      (token: TokenInfo) =>
        token.symbol.toUpperCase() === tokenSymbol.toUpperCase() &&
        token.chainId === this.chainId
    );
  }

  /**
   * Create a wallet from a private key
   */
  public getWalletFromPrivateKey(privateKey: string): Wallet {
    return new Wallet(privateKey, this.provider);
  }
  
  /**
   * Get a wallet from stored encrypted key
   */
  public async getWallet(address: string): Promise<Wallet> {
    const path = `${walletPath}/ethereum`;
    const encryptedPrivateKey = await fse.readFile(
      `${path}/${address}.json`,
      'utf8'
    );

    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('Missing passphrase');
    }
    return await this.decrypt(encryptedPrivateKey, passphrase);
  }
  
  /**
   * Get the first available wallet address
   */
  public async getFirstWalletAddress(): Promise<string | null> {
    const path = `${walletPath}/ethereum`;
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

  /**
   * Encrypt a private key
   */
  public encrypt(privateKey: string, password: string): Promise<string> {
    const wallet = this.getWalletFromPrivateKey(privateKey);
    return wallet.encrypt(password);
  }

  /**
   * Decrypt an encrypted private key
   */
  public async decrypt(
    encryptedPrivateKey: string,
    password: string
  ): Promise<Wallet> {
    const wallet = await Wallet.fromEncryptedJson(
      encryptedPrivateKey,
      password
    );
    return wallet.connect(this.provider);
  }

  /**
   * Get native token balance
   */
  public async getNativeBalance(wallet: Wallet): Promise<TokenValue> {
    const balance = await wallet.getBalance();
    return { value: balance, decimals: 18 };
  }

  /**
   * Get ERC-20 token balance
   */
  public async getERC20Balance(
    contract: Contract,
    wallet: Wallet,
    decimals: number
  ): Promise<TokenValue> {
    const balance: BigNumber = await contract.balanceOf(wallet.address);
    logger.info(`Token balance for ${wallet.address}: ${balance.toString()}`);
    return { value: balance, decimals: decimals };
  }

  /**
   * Get ERC-20 token allowance
   */
  public async getERC20Allowance(
    contract: Contract,
    wallet: Wallet,
    spender: string,
    decimals: number
  ): Promise<TokenValue> {
    const allowance = await contract.allowance(wallet.address, spender);
    return { value: allowance, decimals: decimals };
  }

  /**
   * Get transaction details
   */
  public async getTransaction(txHash: string): Promise<providers.TransactionResponse> {
    return this.provider.getTransaction(txHash);
  }

  /**
   * Get transaction receipt directly
   */
  public async getTransactionReceipt(
    txHash: string
  ): Promise<providers.TransactionReceipt | null> {
    return this.provider.getTransactionReceipt(txHash);
  }

  /**
   * Approve ERC-20 token spending with provided parameters
   * This version doesn't use nonce management
   */
  public async approveERC20(
    contract: Contract,
    wallet: Wallet,
    spender: string,
    amount: BigNumber,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    gasPrice?: number
  ): Promise<Transaction> {
    logger.info(`Approving ${amount.toString()} tokens for spender ${spender}`);
    
    const params: any = {
      gasLimit: this.gasLimitTransaction,
    };
    
    // Use provided nonce or get current nonce from provider
    if (nonce !== undefined) {
      params.nonce = nonce;
    } else {
      params.nonce = await this.provider.getTransactionCount(wallet.address);
    }
    
    // Set gas pricing parameters
    if (maxFeePerGas || maxPriorityFeePerGas) {
      params.maxFeePerGas = maxFeePerGas;
      params.maxPriorityFeePerGas = maxPriorityFeePerGas;
    } else if (gasPrice) {
      params.gasPrice = (gasPrice * 1e9).toFixed(0);
    } else {
      // Always fetch gas price from the network
      const currentGasPrice = await this.provider.getGasPrice();
      params.gasPrice = currentGasPrice.toString();
      logger.info(`Using network gas price: ${utils.formatUnits(currentGasPrice, 'gwei')} GWEI`);
    }
    
    return contract.approve(spender, amount, params);
  }

  /**
   * Get current block number
   */
  public async getCurrentBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  /**
   * Close the Ethereum connector and clean up resources
   */
  public async close() {
    if (this.network in Ethereum._instances) {
      delete Ethereum._instances[this.network];
    }
  }
}
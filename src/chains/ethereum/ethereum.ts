import { Provider } from '@ethersproject/abstract-provider';
import { BigNumber, Contract, ContractTransaction, providers, Transaction, utils, Wallet, ethers } from 'ethers';
import { getAddress } from 'ethers/lib/utils';
import fse from 'fs-extra';

import { TokenListType, TokenValue } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { walletPath, isHardwareWallet as checkIsHardwareWallet } from '../../wallet/utils';

import { getEthereumConfig } from './ethereum.config';

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
  private static _walletAddressExample: string | null = null;
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
    const config = getEthereumConfig('ethereum', network);
    this.chainId = config.network.chainID;
    this.rpcUrl = config.network.nodeURL;
    logger.info(`Initializing Ethereum connector for network: ${network}, nodeURL: ${this.rpcUrl}`);
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
      let adjustedFee: BigNumber;

      // Only get priority fee for mainnet
      if (this.network === 'mainnet') {
        priorityFee = BigNumber.from(await this.provider.send('eth_maxPriorityFeePerGas', []));
      }

      // Base network needs special handling for gas prices
      // Base network sometimes reports very low gas prices that don't match reality
      if (this.network === 'base') {
        // For Base, use at least 2.5 Gwei as minimum or 2x the current price
        const minBaseGasPrice = utils.parseUnits('2.5', 'gwei');
        const baseMultiplier = baseFee.mul(200).div(100); // 2x current

        // Use the larger of the two values
        adjustedFee = baseFee.lt(minBaseGasPrice) ? minBaseGasPrice : baseMultiplier;

        logger.info(`[GAS PRICE] Base network detected: Using higher gas price. Reported gas price was too low.`);
        logger.info(
          `[GAS PRICE] Raw gas price: ${baseFee.toNumber() * 1e-9} GWEI, Adjusted: ${adjustedFee.toNumber() * 1e-9} GWEI`,
        );
      } else {
        // For other networks, just add the priority fee
        adjustedFee = baseFee.add(priorityFee);
      }

      const totalFeeGwei = adjustedFee.toNumber() * 1e-9;
      logger.info(`[GAS PRICE] Estimated: ${totalFeeGwei} GWEI for network ${this.network}`);

      return totalFeeGwei;
    } catch (error: any) {
      logger.error(`Failed to estimate gas price: ${error.message}`);
      return this.gasPrice; // Return existing gas price as fallback
    }
  }

  /**
   * Prepare gas options for a transaction
   * @param priorityFeePerCU Priority fee in Gwei (optional)
   * @param computeUnits Gas limit (optional)
   * @returns Gas options object for ethers.js transaction
   */
  public async prepareGasOptions(priorityFeePerCU?: number, computeUnits?: number): Promise<any> {
    const gasOptions: any = {
      gasLimit: computeUnits || this.gasLimitTransaction,
    };

    // Add EIP-1559 parameters if priorityFeePerCU is provided
    if (priorityFeePerCU !== undefined) {
      gasOptions.type = 2; // EIP-1559 transaction
      const priorityFeePerGasWei = utils.parseUnits(priorityFeePerCU.toString(), 'gwei');
      gasOptions.maxPriorityFeePerGas = priorityFeePerGasWei;

      // Get current base fee and add priority fee with 10% buffer
      const block = await this.provider.getBlock('latest');
      const baseFee = block.baseFeePerGas || BigNumber.from(0);
      gasOptions.maxFeePerGas = baseFee.add(priorityFeePerGasWei).mul(110).div(100);
    }

    return gasOptions;
  }

  /**
   * Get a contract instance for a token using standard ERC20 interface
   */
  public getContract(tokenAddress: string, signerOrProvider?: Wallet | Provider): Contract {
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
      'event Approval(address indexed owner, address indexed spender, uint256 amount)',
    ];

    return new Contract(tokenAddress, erc20Interface, signerOrProvider || this.provider);
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
  public async loadTokens(_tokenListSource: string, _tokenListType: TokenListType): Promise<void> {
    logger.info(`Loading tokens for ethereum/${this.network} using TokenService`);
    try {
      // Use TokenService to load tokens
      const tokens = await TokenService.getInstance().loadTokenList('ethereum', this.network);

      // Convert to TokenInfo format with chainId and normalize addresses
      this.tokenList = tokens.map((token) => ({
        ...token,
        address: getAddress(token.address), // Normalize to checksummed address
        chainId: this.chainId,
      }));

      if (this.tokenList) {
        logger.info(`Loaded ${this.tokenList.length} tokens for ethereum/${this.network}`);
        // Build token map for faster lookups
        this.tokenList.forEach((token: TokenInfo) => (this.tokenMap[token.symbol] = token));
      }
    } catch (error) {
      logger.error(`Failed to load token list: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all tokens loaded from the token list
   */
  public get storedTokenList(): TokenInfo[] {
    return Object.values(this.tokenMap);
  }

  /**
   * Get token info by symbol or address
   */
  public getToken(tokenSymbol: string): TokenInfo | undefined {
    // First try to find token by symbol
    const tokenBySymbol = this.tokenList.find(
      (token: TokenInfo) => token.symbol.toUpperCase() === tokenSymbol.toUpperCase() && token.chainId === this.chainId,
    );

    if (tokenBySymbol) {
      return tokenBySymbol;
    }

    // If not found by symbol, check if it's a valid address
    try {
      const normalizedAddress = utils.getAddress(tokenSymbol);
      // Try to find token by normalized address
      return this.tokenList.find(
        (token: TokenInfo) =>
          token.address.toLowerCase() === normalizedAddress.toLowerCase() && token.chainId === this.chainId,
      );
    } catch {
      // If not a valid address format, return undefined
      return undefined;
    }
  }

  /**
   * Get multiple tokens and return a map with symbols as keys
   * This helper function is used by routes like allowances and balances
   * @param tokens Array of token symbols or addresses
   * @returns Map of token symbol to TokenInfo for found tokens
   */
  public getTokensAsMap(tokens: string[]): Record<string, TokenInfo> {
    const tokenMap: Record<string, TokenInfo> = {};

    for (const symbolOrAddress of tokens) {
      const tokenInfo = this.getToken(symbolOrAddress);
      if (tokenInfo) {
        // Use the actual token symbol as the key, not the input which might be an address
        tokenMap[tokenInfo.symbol] = tokenInfo;
      }
    }

    return tokenMap;
  }

  /**
   * Create a wallet from a private key
   */
  public getWalletFromPrivateKey(privateKey: string): Wallet {
    return new Wallet(privateKey, this.provider);
  }

  /**
   * Validate Ethereum address format
   * @param address The address to validate
   * @returns The checksummed address if valid
   * @throws Error if the address is invalid
   */
  public static validateAddress(address: string): string {
    try {
      // getAddress will both validate the address format and return a checksummed version
      return getAddress(address);
    } catch (error) {
      throw new Error(`Invalid Ethereum address format: ${address}`);
    }
  }

  public async getWallet(address: string): Promise<Wallet> {
    try {
      // Validate the address format first
      const validatedAddress = Ethereum.validateAddress(address);

      const path = `${walletPath}/ethereum`;
      const encryptedPrivateKey = await fse.readFile(`${path}/${validatedAddress}.json`, 'utf8');

      const passphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!passphrase) {
        throw new Error('Missing passphrase');
      }
      return await this.decrypt(encryptedPrivateKey, passphrase);
    } catch (error) {
      if (error.message.includes('Invalid Ethereum address')) {
        throw error; // Re-throw validation errors
      }
      if (error.code === 'ENOENT') {
        throw new Error(`Wallet not found for address: ${address}`);
      }
      throw error;
    }
  }

  /**
   * Get the first available Ethereum wallet address
   */
  public static async getFirstWalletAddress(): Promise<string | null> {
    const path = `${walletPath}/ethereum`;
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
        return Ethereum.validateAddress(walletAddress);
      } catch (e) {
        logger.warn(`Invalid Ethereum address found in wallet directory: ${walletAddress}`);
        return null;
      }
    } catch (err) {
      return null;
    }
  }

  /**
   * Check if an address is a hardware wallet
   */
  public async isHardwareWallet(address: string): Promise<boolean> {
    try {
      return await checkIsHardwareWallet('ethereum', address);
    } catch (error) {
      logger.error(`Error checking hardware wallet status: ${error.message}`);
      return false;
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
  public async decrypt(encryptedPrivateKey: string, password: string): Promise<Wallet> {
    const wallet = await Wallet.fromEncryptedJson(encryptedPrivateKey, password);
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
   * Get native token balance by address
   */
  public async getNativeBalanceByAddress(address: string): Promise<TokenValue> {
    const balance = await this.provider.getBalance(address);
    return { value: balance, decimals: 18 };
  }

  /**
   * Get ERC-20 token balance
   */
  public async getERC20Balance(
    contract: Contract,
    wallet: Wallet,
    decimals: number,
    timeoutMs: number = 5000, // Default 5 second timeout
  ): Promise<TokenValue> {
    // Add timeout to prevent hanging on problematic tokens
    const balancePromise = contract.balanceOf(wallet.address);

    // Create a timeout promise that rejects after specified timeout
    const timeoutPromise = new Promise<BigNumber>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Token balance request timed out'));
      }, timeoutMs);
    });

    // Race the balance request against the timeout
    const balance: BigNumber = await Promise.race([balancePromise, timeoutPromise]);

    logger.debug(`Token balance for ${wallet.address}: ${balance.toString()}`);
    return { value: balance, decimals: decimals };
  }

  /**
   * Get ERC-20 token balance by address
   */
  public async getERC20BalanceByAddress(
    contract: Contract,
    address: string,
    decimals: number,
    timeoutMs: number = 5000, // Default 5 second timeout
  ): Promise<TokenValue> {
    // Add timeout to prevent hanging on problematic tokens
    const balancePromise = contract.balanceOf(address);

    // Create a timeout promise that rejects after specified timeout
    const timeoutPromise = new Promise<BigNumber>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Token balance request timed out'));
      }, timeoutMs);
    });

    // Race the balance request against the timeout
    const balance: BigNumber = await Promise.race([balancePromise, timeoutPromise]);

    logger.debug(`Token balance for ${address}: ${balance.toString()}`);
    return { value: balance, decimals: decimals };
  }

  /**
   * Get ERC-20 token allowance
   */
  public async getERC20Allowance(
    contract: Contract,
    wallet: Wallet,
    spender: string,
    decimals: number,
  ): Promise<TokenValue> {
    const allowance = await contract.allowance(wallet.address, spender);
    return { value: allowance, decimals: decimals };
  }

  /**
   * Get ERC-20 token allowance by address
   */
  public async getERC20AllowanceByAddress(
    contract: Contract,
    ownerAddress: string,
    spender: string,
    decimals: number,
  ): Promise<TokenValue> {
    const allowance = await contract.allowance(ownerAddress, spender);
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
  public async getTransactionReceipt(txHash: string): Promise<providers.TransactionReceipt | null> {
    return this.provider.getTransactionReceipt(txHash);
  }

  /**
   * Approve ERC-20 token spending
   */
  public async approveERC20(
    contract: Contract,
    wallet: Wallet,
    spender: string,
    amount: BigNumber,
  ): Promise<Transaction> {
    logger.info(`Approving ${amount.toString()} tokens for spender ${spender}`);

    const params: any = {
      gasLimit: this.gasLimitTransaction,
      nonce: await this.provider.getTransactionCount(wallet.address),
    };

    // Always fetch gas price from the network
    const currentGasPrice = await this.provider.getGasPrice();
    params.gasPrice = currentGasPrice.toString();
    logger.info(`Using network gas price: ${utils.formatUnits(currentGasPrice, 'gwei')} GWEI`);

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

  // WETH ABI for wrap/unwrap operations
  private static WETH9ABI = [
    // Standard ERC20 functions
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',

    // WETH-specific functions
    'function deposit() public payable',
    'function withdraw(uint256 amount) public',
  ];

  // Define wrapped native token addresses for different networks
  private static WRAPPED_ADDRESSES: {
    [key: string]: { address: string; symbol: string; nativeSymbol: string };
  } = {
    mainnet: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      symbol: 'WETH',
      nativeSymbol: 'ETH',
    },
    arbitrum: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      symbol: 'WETH',
      nativeSymbol: 'ETH',
    },
    optimism: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      nativeSymbol: 'ETH',
    },
    base: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      nativeSymbol: 'ETH',
    },
    sepolia: {
      address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      symbol: 'WETH',
      nativeSymbol: 'ETH',
    },
    polygon: {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      symbol: 'WETH',
      nativeSymbol: 'MATIC',
    },
    bsc: {
      address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      symbol: 'WBNB',
      nativeSymbol: 'BNB',
    },
    avalanche: {
      address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      symbol: 'WAVAX',
      nativeSymbol: 'AVAX',
    },
    celo: {
      address: '0x471EcE3750Da237f93B8E339c536989b8978a438',
      symbol: 'WCELO',
      nativeSymbol: 'CELO',
    },
  };

  /**
   * Get the wrapped token (WETH, WBNB, etc.) address for the current network
   * @returns The address of the wrapped token
   */
  public getWrappedNativeTokenAddress(): string {
    const wrappedInfo = Ethereum.WRAPPED_ADDRESSES[this.network];
    if (!wrappedInfo) {
      throw new Error(`Wrapped token address not found for network: ${this.network}`);
    }
    return wrappedInfo.address;
  }

  /**
   * Check if a token is the wrapped native token (WETH, WBNB, etc.)
   * @param tokenAddress The token address to check
   * @returns True if the token is the wrapped native token
   */
  public isWrappedNativeToken(tokenAddress: string): boolean {
    const wrappedAddress = this.getWrappedNativeTokenAddress();
    return tokenAddress.toLowerCase() === wrappedAddress.toLowerCase();
  }

  /**
   * Wraps native ETH to WETH (or equivalent on other chains)
   * @param wallet The wallet to use for wrapping
   * @param amountInWei The amount of ETH to wrap in wei (as a BigNumber)
   * @returns The transaction receipt
   */
  public async wrapNativeToken(wallet: Wallet, amountInWei: BigNumber): Promise<ContractTransaction> {
    const wrappedAddress = this.getWrappedNativeTokenAddress();

    // Create wrapped token contract instance
    const wrappedContract = new Contract(wrappedAddress, Ethereum.WETH9ABI, wallet);

    // Set transaction parameters
    const params: any = {
      gasLimit: this.gasLimitTransaction,
      nonce: await this.provider.getTransactionCount(wallet.address),
      value: amountInWei, // Send native token with the transaction
    };

    // Always fetch gas price from the network
    const currentGasPrice = await this.provider.getGasPrice();
    params.gasPrice = currentGasPrice.toString();

    // Create transaction to call deposit() function
    logger.info(`Wrapping ${utils.formatEther(amountInWei)} ETH to WETH`);
    return await wrappedContract.deposit(params);
  }

  /**
   * Get a wallet address example for schema documentation
   */
  public static async getWalletAddressExample(): Promise<string> {
    if (Ethereum._walletAddressExample) {
      return Ethereum._walletAddressExample;
    }
    const defaultAddress = '0x0000000000000000000000000000000000000000';
    try {
      const foundWallet = await Ethereum.getFirstWalletAddress();
      if (foundWallet) {
        Ethereum._walletAddressExample = foundWallet;
        return foundWallet;
      }
      logger.debug('No wallets found for examples in schema, using default.');
      Ethereum._walletAddressExample = defaultAddress;
      return defaultAddress;
    } catch (error) {
      logger.error(`Error getting Ethereum wallet address for example: ${error.message}`);
      return defaultAddress;
    }
  }

  // Check if the address is a valid EVM address
  public static isAddress(address: string): boolean {
    return ethers.utils.isAddress(address);
  }
}

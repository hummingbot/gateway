import { Provider, TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, Contract, providers, utils, Wallet, ethers } from 'ethers';
import { getAddress } from 'ethers/lib/utils';

import { ChainstackService } from '../../rpc/chainstack-service';
import { InfuraService } from '../../rpc/infura-service';
import { createRateLimitAwareEthereumProvider, rateLimitAwareConnection } from '../../rpc/rpc-connection-interceptor';
import { RPCProvider } from '../../rpc/rpc-provider-base';
import { TokenValue, tokenValueToString } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { httpErrors, transactionFailed } from '../../services/error-handler';
import { logger, redactUrl } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { externalWalletRefusal, getEthereumSigner } from '../../wallet/signers/registry';
import { UnsignedEvmTransaction } from '../../wallet/signers/types';
import { listWalletRecords } from '../../wallet/signers/wallet-store';

import { getEthereumNetworkConfig, getEthereumChainConfig } from './ethereum.config';
import { EtherscanService } from './etherscan-service';
import {
  EvmApproval,
  EvmCall,
  EvmTransactionCaptured,
  EvmUnsignedTransaction,
  getEvmBuildContext,
} from './evm-build-mode';
import { ERC20_APPROVE_ABI, MAX_UINT48, PERMIT2_ABI, PERMIT2_ADDRESS } from './permit2';

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

/**
 * Outcome of an EVM liquidity/pool transaction as a route is allowed to report it.
 * A revert is not one of the cases: it throws, so it can never be mistaken for PENDING.
 * See {@link Ethereum.handleTransactionConfirmation}.
 */
export type EthereumTransactionOutcome =
  | { confirmed: false; signature: string }
  | { confirmed: true; signature: string; receipt: providers.TransactionReceipt; fee: number };

// Networks that support EIP-1559 (type 2) transactions
export const EIP1559_NETWORKS = [
  'mainnet',
  'polygon',
  'arbitrum',
  'optimism',
  'base',
  'robinhoodchain',
  'robinhoodchain-testnet',
  'unichain',
];

/** A simulated transaction's gas limit: eth_estimateGas plus 20%. */
const GAS_LIMIT_MARGIN_PCT = 120;

/** The fixed gas limit of an approve that is built before it can be simulated. */
const APPROVE_GAS_LIMIT = 100000;

const ERC20_ALLOWANCE_ABI = ['function allowance(address owner, address spender) view returns (uint256)'];

/** The most specific reason ethers gives for a failed eth_estimateGas. */
function simulationFailureReason(e: any): string {
  return e.error?.error?.message ?? e.error?.message ?? e.reason ?? e.message ?? String(e);
}

/** The ethers request for an unsigned transaction (BigNumber fields, no `from`). */
export function toTransactionRequest(tx: EvmUnsignedTransaction): providers.TransactionRequest {
  return {
    chainId: tx.chainId,
    to: tx.to,
    data: tx.data,
    value: BigNumber.from(tx.value),
    nonce: tx.nonce,
    gasLimit: BigNumber.from(tx.gasLimit),
    type: tx.type,
    ...(tx.type === 2
      ? {
          maxFeePerGas: BigNumber.from(tx.maxFeePerGas),
          maxPriorityFeePerGas: BigNumber.from(tx.maxPriorityFeePerGas),
        }
      : { gasPrice: BigNumber.from(tx.gasPrice) }),
  };
}

/** The seam's view of a built transaction: what a signer signs (no `from`; BigNumber amounts). */
function toSeamTransaction(tx: EvmUnsignedTransaction): UnsignedEvmTransaction {
  const request = toTransactionRequest(tx);
  return { ...request, type: tx.type as 0 | 2 } as UnsignedEvmTransaction;
}

export class Ethereum {
  private static _instances: { [name: string]: Ethereum };
  public provider: providers.StaticJsonRpcProvider;
  public network: string;
  public nativeTokenSymbol: string;
  public chainId: number;
  /** Tokens read from the chain because the configured list did not have them. */
  private readonly chainReadTokens = new Map<string, TokenInfo>();
  public rpcUrl: string;
  public swapProvider: string;
  public gasPrice?: number | null;
  public baseFee?: number | null;
  public priorityFee?: number | null;
  public baseFeeMultiplier: number;
  private _initialized: boolean = false;
  private infuraService?: InfuraService;
  private chainstackService?: ChainstackService;
  private etherscanService?: EtherscanService;

  private static lastGasPriceEstimate: {
    [network: string]: {
      timestamp: number;
      gasPrice: number;
      maxFeePerGas?: number;
      maxPriorityFeePerGas?: number;
      isEIP1559?: boolean;
    };
  } = {};
  private static GAS_PRICE_CACHE_MS = 10000; // 10 second cache
  private _transactionExecutionTimeoutMs: number;

  /**
   * Returns the cached gas price estimate for this instance's network,
   * populated by estimateGasPrice(). Undefined if no estimate has been made.
   */
  public getCachedGasPriceEstimate() {
    return Ethereum.lastGasPriceEstimate[this.network];
  }

  // For backward compatibility
  public get chain(): string {
    return this.network;
  }

  private constructor(network: string) {
    const config = getEthereumNetworkConfig(network);
    this.chainId = config.chainID;
    this.rpcUrl = config.nodeURL;
    this.network = network;
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this.swapProvider = config.swapProvider || '';
    this.gasPrice = config.gasPrice;
    this.baseFee = config.baseFee;
    this.priorityFee = config.priorityFee;
    this.baseFeeMultiplier = config.baseFeeMultiplier || 1.2; // Default to 1.2
    this._transactionExecutionTimeoutMs = config.transactionExecutionTimeoutMs ?? 30000; // Default to 30 seconds

    // Get chain config for etherscanAPIKey
    const chainConfig = getEthereumChainConfig();

    // Initialize Etherscan service if API key is provided and chain is supported
    if (chainConfig.etherscanAPIKey && EtherscanService.isSupported(this.chainId)) {
      try {
        this.etherscanService = new EtherscanService(this.chainId, network, chainConfig.etherscanAPIKey);
        logger.info(
          `✅ Etherscan V2 API configured for ${network} (chainId: ${this.chainId}, key length: ${chainConfig.etherscanAPIKey.length} chars)`,
        );
      } catch (error: any) {
        logger.warn(`Failed to initialize Etherscan service: ${error.message}`);
      }
    }

    // Get rpcProvider from chain config
    const rpcProvider = chainConfig.rpcProvider || 'url';

    // Initialize RPC connection based on provider
    if (rpcProvider === 'infura') {
      this.initializeInfuraProvider();
    } else if (rpcProvider === 'chainstack') {
      this.initializeChainstackProvider();
    } else {
      // Default: use nodeURL with rate limit detection. The connection keeps ethers
      // from retrying 429s so the interceptor is the single retry layer.
      this.provider = createRateLimitAwareEthereumProvider(
        new providers.StaticJsonRpcProvider(rateLimitAwareConnection(this.rpcUrl)),
        this.rpcUrl,
      );
    }
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
    // Check cache first (per-network)
    const cachedEstimate = Ethereum.lastGasPriceEstimate[this.network];
    if (cachedEstimate && Date.now() - cachedEstimate.timestamp < Ethereum.GAS_PRICE_CACHE_MS) {
      logger.debug(`Using cached gas price for ${this.network}: ${cachedEstimate.gasPrice} GWEI`);
      return cachedEstimate.gasPrice;
    }

    // Check if the network supports EIP-1559
    const supportsEIP1559 = EIP1559_NETWORKS.includes(this.network);

    if (supportsEIP1559) {
      try {
        let baseFeeGwei: number;
        let priorityFeeGwei: number;
        let networkBaseFeeGwei: number | undefined;
        let networkPriorityFeeGwei: number | undefined;

        // Try to fetch from Etherscan API first if available
        if (this.etherscanService) {
          try {
            const gasPrices = await this.etherscanService.getRecommendedGasPrices('propose');
            // Round to 4 decimal places to avoid floating-point precision issues
            const networkMaxFeeGwei = Math.round(gasPrices.maxFeePerGas * 10000) / 10000;
            networkPriorityFeeGwei = Math.round(gasPrices.maxPriorityFeePerGas * 10000) / 10000;
            // Estimate baseFee from the formula: baseFee ≈ (maxFee - priority) / 2
            networkBaseFeeGwei = Math.round(((networkMaxFeeGwei - networkPriorityFeeGwei) / 2) * 10000) / 10000;
            logger.info(
              `Etherscan API EIP-1559 fees: baseFee≈${networkBaseFeeGwei.toFixed(4)} GWEI, priority=${networkPriorityFeeGwei.toFixed(4)} GWEI`,
            );
          } catch (scanError: any) {
            logger.warn(`Failed to fetch from Etherscan API: ${scanError.message}`);
            logger.info('Using RPC provider for gas price estimation');
          }
        }

        // Fallback to RPC provider if Etherscan not available or failed
        if (networkBaseFeeGwei === undefined || networkPriorityFeeGwei === undefined) {
          try {
            const feeData = await this.provider.getFeeData();
            if (feeData.maxPriorityFeePerGas) {
              const block = await this.provider.getBlock('latest');
              const baseFee = block.baseFeePerGas || BigNumber.from('0');

              // Round to 4 decimal places to avoid floating-point precision issues
              networkBaseFeeGwei = Math.round(parseFloat(utils.formatUnits(baseFee, 'gwei')) * 10000) / 10000;
              networkPriorityFeeGwei =
                Math.round(parseFloat(utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')) * 10000) / 10000;

              logger.info(
                `Network RPC EIP-1559 fees: baseFee=${networkBaseFeeGwei.toFixed(4)} GWEI, priority=${networkPriorityFeeGwei.toFixed(4)} GWEI`,
              );
            }
          } catch (networkError: any) {
            logger.warn(`Failed to fetch network EIP-1559 data: ${networkError.message}`);
          }
        }

        // Support partial configuration: use configured values if available, otherwise use network values
        const hasConfiguredBaseFee = typeof this.baseFee === 'number';
        const hasConfiguredPriority = typeof this.priorityFee === 'number';
        const hasNetworkFees = networkBaseFeeGwei !== undefined && networkPriorityFeeGwei !== undefined;

        if (!hasConfiguredBaseFee && !hasConfiguredPriority && !hasNetworkFees) {
          throw new Error('EIP-1559 fee data not available from network or config');
        }

        // Start with network values as defaults (if available)
        baseFeeGwei = networkBaseFeeGwei ?? 0;
        priorityFeeGwei = networkPriorityFeeGwei ?? 0;

        // Override with configured values if present
        if (hasConfiguredBaseFee) {
          baseFeeGwei = this.baseFee!;
        }
        if (hasConfiguredPriority) {
          priorityFeeGwei = this.priorityFee!;
        }

        // Log what was used
        if (hasConfiguredBaseFee && hasConfiguredPriority) {
          logger.info(`Using configured EIP-1559 fees: baseFee=${baseFeeGwei} GWEI, priority=${priorityFeeGwei} GWEI`);
        } else if (hasConfiguredBaseFee) {
          logger.info(
            `Using mixed EIP-1559 fees: baseFee=${baseFeeGwei} GWEI (configured), priority=${priorityFeeGwei.toFixed(4)} GWEI (network)`,
          );
        } else if (hasConfiguredPriority) {
          logger.info(
            `Using mixed EIP-1559 fees: baseFee=${baseFeeGwei.toFixed(4)} GWEI (network), priority=${priorityFeeGwei} GWEI (configured)`,
          );
        } else {
          logger.info(
            `Using network EIP-1559 fees: baseFee=${baseFeeGwei.toFixed(4)} GWEI, priority=${priorityFeeGwei.toFixed(4)} GWEI`,
          );
        }

        // Construct maxFeePerGas and maxPriorityFeePerGas from baseFee and priorityFee
        // Formula: maxFeePerGas = (baseFee * baseFeeMultiplier) + priorityFee
        const maxFeePerGasGwei = Math.round((baseFeeGwei * this.baseFeeMultiplier + priorityFeeGwei) * 10000) / 10000;
        const maxPriorityFeePerGasGwei = priorityFeeGwei;

        logger.info(
          `Constructed tx fees (multiplier=${this.baseFeeMultiplier}): maxFeePerGas=${maxFeePerGasGwei.toFixed(4)} GWEI, maxPriorityFeePerGas=${maxPriorityFeePerGasGwei.toFixed(4)} GWEI`,
        );

        // Cache the result (per-network)
        Ethereum.lastGasPriceEstimate[this.network] = {
          timestamp: Date.now(),
          gasPrice: maxFeePerGasGwei,
          maxFeePerGas: maxFeePerGasGwei,
          maxPriorityFeePerGas: maxPriorityFeePerGasGwei,
          isEIP1559: true,
        };

        logger.info(`Estimated: ${maxFeePerGasGwei} GWEI for network ${this.network}`);
        return maxFeePerGasGwei;
      } catch (error: any) {
        logger.warn(`Failed to get EIP-1559 fee data, falling back to legacy pricing: ${error.message}`);
      }
    }

    // Legacy gas price estimation
    try {
      let gasPriceGwei: number;

      // Check if configured gas price is available
      if (typeof this.gasPrice === 'number') {
        gasPriceGwei = this.gasPrice;
        logger.info(`Using configured gas price: ${gasPriceGwei} GWEI`);
      } else {
        // Fetch from network
        const networkGasPrice: BigNumber = await this.provider.getGasPrice();
        gasPriceGwei = Math.round(parseFloat(utils.formatUnits(networkGasPrice, 'gwei')) * 10000) / 10000;
        logger.info(`Using network gas price: ${gasPriceGwei.toFixed(4)} GWEI`);
      }

      logger.info(`Estimated: ${gasPriceGwei} GWEI for network ${this.network}`);

      // Cache the result (per-network)
      Ethereum.lastGasPriceEstimate[this.network] = {
        timestamp: Date.now(),
        gasPrice: gasPriceGwei,
        isEIP1559: false,
      };

      return gasPriceGwei;
    } catch (error: any) {
      logger.error(`Failed to estimate gas price: ${error.message}`);
      throw error; // Throw error instead of returning fallback
    }
  }

  /**
   * Prepare gas options for a transaction
   * @param gasPrice Gas price in Gwei (optional, uses cached estimate if not provided)
   * @param gasLimit Gas limit (optional, defaults to 300000)
   * @returns Gas options object for ethers.js transaction
   */
  public async prepareGasOptions(gasPrice?: number, gasLimit?: number): Promise<any> {
    const gasOptions: any = {};

    // Set default gas limit if not provided
    const DEFAULT_GAS_LIMIT = 300000;
    gasOptions.gasLimit = gasLimit ?? DEFAULT_GAS_LIMIT;

    // Check if the network supports EIP-1559
    const supportsEIP1559 = EIP1559_NETWORKS.includes(this.network);

    if (supportsEIP1559) {
      // Use cached EIP-1559 values from estimateGasPrice if available, not stale, and gasPrice not explicitly provided
      const cachedEstimate = Ethereum.lastGasPriceEstimate[this.network];
      if (
        !gasPrice &&
        cachedEstimate?.isEIP1559 &&
        cachedEstimate?.maxFeePerGas !== undefined &&
        cachedEstimate?.maxPriorityFeePerGas !== undefined &&
        Date.now() - cachedEstimate.timestamp < Ethereum.GAS_PRICE_CACHE_MS
      ) {
        gasOptions.type = 2;
        gasOptions.maxFeePerGas = utils.parseUnits(cachedEstimate.maxFeePerGas.toString(), 'gwei');
        gasOptions.maxPriorityFeePerGas = utils.parseUnits(cachedEstimate.maxPriorityFeePerGas.toString(), 'gwei');

        logger.info(
          `Using cached EIP-1559 pricing for ${this.network}: maxFee=${cachedEstimate.maxFeePerGas} GWEI, priority=${cachedEstimate.maxPriorityFeePerGas} GWEI`,
        );
        return gasOptions;
      }

      // If gasPrice is provided, use it as maxFeePerGas with configured or default priority fee
      if (gasPrice) {
        const priorityFee = (typeof this.priorityFee === 'number' ? this.priorityFee : null) || 0.001; // Default 0.001 GWEI priority fee
        gasOptions.type = 2;
        gasOptions.maxFeePerGas = utils.parseUnits(gasPrice.toString(), 'gwei');
        gasOptions.maxPriorityFeePerGas = utils.parseUnits(priorityFee.toString(), 'gwei');

        logger.info(
          `Using EIP-1559 pricing with provided gasPrice: maxFee=${gasPrice} GWEI, priority=${priorityFee} GWEI`,
        );
        return gasOptions;
      }

      // If no cached values and no gasPrice provided, call estimateGasPrice to fetch/cache values
      logger.warn('No cached EIP-1559 data available, calling estimateGasPrice()');
      await this.estimateGasPrice();

      // Try again with newly cached values (per-network)
      const newCache = Ethereum.lastGasPriceEstimate[this.network];
      if (newCache?.isEIP1559 && newCache?.maxFeePerGas !== undefined && newCache?.maxPriorityFeePerGas !== undefined) {
        gasOptions.type = 2;
        gasOptions.maxFeePerGas = utils.parseUnits(newCache.maxFeePerGas.toString(), 'gwei');
        gasOptions.maxPriorityFeePerGas = utils.parseUnits(newCache.maxPriorityFeePerGas.toString(), 'gwei');

        logger.info(
          `Using newly fetched EIP-1559 pricing for ${this.network}: maxFee=${newCache.maxFeePerGas} GWEI, priority=${newCache.maxPriorityFeePerGas} GWEI`,
        );
        return gasOptions;
      }
    }

    // Fallback to legacy gas pricing (type 0)
    const gasPriceInGwei = gasPrice ?? (await this.estimateGasPrice());
    gasOptions.type = 0;
    gasOptions.gasPrice = utils.parseUnits(gasPriceInGwei.toString(), 'gwei');
    logger.info(`Using legacy gas pricing: ${gasPriceInGwei} GWEI with gasLimit: ${gasOptions.gasLimit}`);

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
   * Initialize Infura provider with configuration
   */
  private initializeInfuraProvider(): void {
    try {
      const configManager = ConfigManagerV2.getInstance();
      const providerConfig = {
        apiKey: configManager.get('apiKeys.infura') || '',
      };

      // Validate API key
      if (!providerConfig.apiKey || providerConfig.apiKey.trim() === '' || providerConfig.apiKey.includes('YOUR_')) {
        logger.warn(`⚠️ Infura provider selected but no valid API key configured`);
        logger.info(`Using standard RPC from nodeURL: ${redactUrl(this.rpcUrl)}`);
        this.provider = createRateLimitAwareEthereumProvider(
          new providers.StaticJsonRpcProvider(rateLimitAwareConnection(this.rpcUrl)),
          this.rpcUrl,
        );
        return;
      }

      // Create InfuraService instance
      this.infuraService = new InfuraService(providerConfig, {
        chain: 'ethereum',
        network: this.network,
        chainId: this.chainId,
      });

      logger.info(`✅ Infura API key configured (length: ${providerConfig.apiKey.length} chars)`);

      // Use Infura provider
      this.provider = this.infuraService.getProvider() as providers.StaticJsonRpcProvider;
    } catch (error: any) {
      logger.warn(`Failed to initialize Infura provider: ${error.message}`);
      logger.info(`Using standard RPC from nodeURL: ${redactUrl(this.rpcUrl)}`);
      this.provider = createRateLimitAwareEthereumProvider(
        new providers.StaticJsonRpcProvider(rateLimitAwareConnection(this.rpcUrl)),
        this.rpcUrl,
      );
    }
  }

  /**
   * Initialize Chainstack provider with configuration
   *
   * Discovery runs during async init(); this sync setup only validates the
   * API key and seeds `this.provider` with nodeURL. Once init() resolves, the
   * provider is swapped to the Chainstack-discovered endpoint.
   */
  private initializeChainstackProvider(): void {
    // Placeholder provider — swapped to the Chainstack URL in init() after discovery.
    this.provider = createRateLimitAwareEthereumProvider(
      new providers.StaticJsonRpcProvider(rateLimitAwareConnection(this.rpcUrl)),
      this.rpcUrl,
    );

    try {
      const configManager = ConfigManagerV2.getInstance();
      const apiKey = configManager.get('apiKeys.chainstack') || '';

      if (!apiKey || apiKey.trim() === '' || apiKey.includes('YOUR_')) {
        logger.warn(`⚠️ Chainstack provider selected but no valid API key configured`);
        logger.info(`Using standard RPC from nodeURL: ${redactUrl(this.rpcUrl)}`);
        return;
      }

      this.chainstackService = new ChainstackService(
        { apiKey },
        { chain: 'ethereum', network: this.network, chainId: this.chainId },
      );

      logger.info(`✅ Chainstack API key configured (length: ${apiKey.length} chars)`);
    } catch (error: any) {
      logger.warn(`Failed to initialize Chainstack provider: ${error.message}, falling back to standard RPC`);
    }
  }

  /**
   * Initialize the Ethereum connector
   */
  public async init(): Promise<void> {
    try {
      if (this.chainstackService) {
        try {
          await this.chainstackService.initialize();
          this.provider = this.chainstackService.getProvider();
          logger.info(`Using Chainstack RPC URL: ${redactUrl(this.chainstackService.getHttpUrl())}`);
        } catch (providerError: any) {
          logger.warn(`Chainstack initialize failed: ${providerError.message}, using nodeURL fallback`);
          this.chainstackService = undefined;
        }
      }

      this._initialized = true;
    } catch (e) {
      logger.error(`Failed to initialize Ethereum chain: ${e}`);
      throw e;
    }
  }

  /**
   * Get all tokens from the token list (reads from disk each time)
   */
  public async getTokenList(): Promise<TokenInfo[]> {
    const tokens = await TokenService.getInstance().loadTokenList('ethereum', this.network);
    return tokens.map((token) => ({
      ...token,
      address: getAddress(token.address), // Normalize to checksummed address
      chainId: this.chainId,
    }));
  }

  /**
   * Get token info by symbol or address, from the configured list or the chain.
   *
   * A symbol can only come from the list — there is nothing to ask the chain about a
   * name it does not hold — so an unknown one is still undefined. An address is
   * different: it identifies a contract that can be asked what it is, and until it was,
   * every route describing a pool by its token addresses failed on any token the list
   * happened to omit. Uniswap's pool-info answered `Token information not found for
   * pool` for a real pool on real tokens, which is what Solana's getToken has always
   * avoided by reading the mint.
   *
   * @param tokenSymbol Token symbol or contract address
   * @returns TokenInfo, or undefined for a symbol that is not listed and an address
   *          that is not an ERC-20
   */
  public async getToken(tokenSymbol: string): Promise<TokenInfo | undefined> {
    const tokenList = await this.getTokenList();

    // First try to find token by symbol
    const tokenBySymbol = tokenList.find(
      (token: TokenInfo) => token.symbol.toUpperCase() === tokenSymbol.toUpperCase() && token.chainId === this.chainId,
    );

    if (tokenBySymbol) {
      return tokenBySymbol;
    }

    // If not found by symbol, check if it's a valid address
    let normalizedAddress: string;
    try {
      normalizedAddress = utils.getAddress(tokenSymbol);
    } catch {
      // Not an address, so the list was the only place it could have been.
      return undefined;
    }

    const tokenByAddress = tokenList.find(
      (token: TokenInfo) =>
        token.address.toLowerCase() === normalizedAddress.toLowerCase() && token.chainId === this.chainId,
    );

    return tokenByAddress ?? (await this.tokenFromChainCached(normalizedAddress));
  }

  /**
   * A chain-read token, remembered for the life of the process.
   *
   * getToken runs in loops — over the tokens of a balance request, over every position a
   * wallet owns — so an address the list omits would otherwise cost three eth_calls on
   * every pass, forever, for a name, symbol and decimals that cannot change. Only
   * successes are remembered: an address with no contract today may have one tomorrow.
   */
  private async tokenFromChainCached(address: string): Promise<TokenInfo | undefined> {
    const cached = this.chainReadTokens.get(address);
    if (cached) {
      return cached;
    }

    const token = await this.fetchTokenFromChain(address);
    if (!token) {
      return undefined;
    }

    this.chainReadTokens.set(address, token);
    return token;
  }

  /**
   * Read a token's name, symbol and decimals from the chain.
   *
   * getToken above only searches the configured list, so an unlisted token is simply
   * absent there. These three are standard ERC-20 view calls and the ABI for them is
   * already in getContract, so nothing outside the chain is consulted.
   *
   * Returns null when the address is not a contract that answers them — a wallet
   * address, or a token predating the metadata methods — rather than inventing a name.
   */
  public async fetchTokenFromChain(address: string): Promise<TokenInfo | null> {
    let normalizedAddress: string;
    try {
      normalizedAddress = getAddress(address);
    } catch {
      return null;
    }

    try {
      const contract = this.getContract(normalizedAddress);
      const [name, symbol, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.decimals()]);

      if (!symbol) {
        return null;
      }

      return {
        address: normalizedAddress,
        chainId: this.chainId,
        decimals: Number(decimals),
        name: name || symbol,
        symbol,
      };
    } catch (e: any) {
      logger.debug(`No ERC-20 metadata at ${normalizedAddress}: ${e.message}`);
      return null;
    }
  }

  /**
   * Get multiple tokens and return a map with symbols as keys
   * This helper function is used by routes like allowances and balances
   * @param tokens Array of token symbols or addresses
   * @returns Map of token symbol to TokenInfo for found tokens
   */
  public async getTokensAsMap(tokens: string[]): Promise<Record<string, TokenInfo>> {
    const tokenMap: Record<string, TokenInfo> = {};

    for (const symbolOrAddress of tokens) {
      const tokenInfo = await this.getToken(symbolOrAddress);
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

  /** A signer may not change what it was given: check the signed transaction against it. */
  public static assertSignedAsBuilt(
    signed: string,
    unsigned: UnsignedEvmTransaction,
    address: string,
    kind: string,
  ): void {
    const parsed = utils.parseTransaction(signed);
    const mismatches: string[] = [];
    if (!parsed.from || parsed.from.toLowerCase() !== address.toLowerCase()) mismatches.push(`from ${parsed.from}`);
    if (parsed.chainId !== unsigned.chainId) mismatches.push(`chainId ${parsed.chainId}`);
    if (parsed.nonce !== unsigned.nonce) mismatches.push(`nonce ${parsed.nonce}`);
    if ((parsed.to ?? '').toLowerCase() !== unsigned.to.toLowerCase()) mismatches.push(`to ${parsed.to}`);
    if (parsed.data.toLowerCase() !== unsigned.data.toLowerCase()) mismatches.push('data');
    if (!parsed.value.eq(unsigned.value)) mismatches.push(`value ${parsed.value.toString()}`);
    if (mismatches.length > 0) {
      throw httpErrors.internalServerError(
        `The ${kind} signer of ${address} returned a transaction that differs from the one built: ${mismatches.join(', ')}`,
      );
    }
  }

  /**
   * Get the first available Ethereum wallet address
   */
  public static async getFirstWalletAddress(): Promise<string | null> {
    const records = await listWalletRecords('ethereum');
    return records.length > 0 ? records[0].address : null;
  }

  /**
   * Get the active RPC provider service (Infura, Chainstack, etc.) if one
   * is configured. Returns the polymorphic base type so callers don't need
   * to special-case providers — mirrors Solana.getRpcProviderService().
   */
  public getRpcProviderService(): RPCProvider | null {
    return this.chainstackService || this.infuraService || null;
  }

  /**
   * Encrypt a private key
   */
  public encrypt(privateKey: string, password: string): Promise<string> {
    const wallet = this.getWalletFromPrivateKey(privateKey);
    return wallet.encrypt(password);
  }

  /**
   * Get native token balance by address
   */
  public async getNativeBalanceByAddress(address: string): Promise<TokenValue> {
    const balance = await this.provider.getBalance(address);
    return { value: balance, decimals: 18 };
  }

  /**
   * Get ERC-20 token balance by address
   */
  public async getERC20BalanceByAddress(
    contract: Contract,
    address: string,
    decimals: number,
    timeoutMs: number = 5000, // Default 5 second timeout
    tokenSymbol?: string, // Optional token symbol for logging
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

    if (tokenSymbol) {
      logger.debug(`Token balance for ${tokenSymbol}: ${balance.toString()}`);
    }
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
   * The single chokepoint every EVM operation sends its transaction through (#673, #682).
   *
   * Builds the complete unsigned transaction (nonce, gas limit from eth_estimateGas, fee
   * fields), then has the wallet's signer (the seam) sign it, checks that what was signed
   * is what was built, and broadcasts it. Inside a build
   * route (`captureEvmTransaction`) it stops after the build and throws the captured
   * transaction instead: nothing is signed or sent, and no key is loaded.
   */
  public async sendTransactionForWallet(walletAddress: string, call: EvmCall): Promise<TransactionResponse> {
    const from = Ethereum.validateAddress(walletAddress);
    const build = getEvmBuildContext();

    if (build) {
      // Build mode looks up no signer: the address need not be a wallet Gateway knows.
      const firstNonce = await this.provider.getTransactionCount(from, 'pending');
      const approvals: EvmApproval[] = [];
      for (const [i, pending] of build.approvals.entries()) {
        approvals.push({
          token: pending.token,
          symbol: pending.symbol,
          spender: pending.spender,
          amount: utils.formatUnits(pending.required, pending.decimals),
          currentAllowance: utils.formatUnits(pending.current, pending.decimals),
          transaction: await this.buildUnsignedTransaction(from, pending.call, firstNonce + i, true),
        });
      }
      // An operation whose approvals have not landed would revert in simulation.
      const simulated = approvals.length === 0;
      const unsignedTransaction = await this.buildUnsignedTransaction(
        from,
        call,
        firstNonce + approvals.length,
        simulated,
      );
      logger.info(
        `Built unsigned ${call.description} for ${from} (nonce ${unsignedTransaction.nonce}, ` +
          `${approvals.length} approval(s) first, simulated: ${simulated})`,
      );
      throw new EvmTransactionCaptured({ unsignedTransaction, approvals, simulated });
    }

    // Execute: the wallet's signer (the seam, #673) signs exactly what build would return.
    const signer = await getEthereumSigner(from);
    if (signer.kind === 'external') {
      throw externalWalletRefusal('ethereum', from, 'Gateway holds no key for an external wallet');
    }
    const firstNonce = await this.provider.getTransactionCount(from, 'pending');
    const unsigned = toSeamTransaction(await this.buildUnsignedTransaction(from, call, firstNonce, true));
    const result = await signer.signTransaction(unsigned);
    if (result.kind === 'unsigned') {
      throw externalWalletRefusal('ethereum', from, result.reason);
    }
    Ethereum.assertSignedAsBuilt(result.value, unsigned, from, signer.kind);
    const response = await this.broadcastSignedTransaction(result.value);
    logger.info(`Sent ${call.description}: ${response.hash} (nonce ${unsigned.nonce})`);
    return response;
  }

  /**
   * The unsigned transaction for `call` at `nonce`. Simulated: the gas limit is
   * eth_estimateGas plus a margin, and a call that would revert is refused with the
   * revert reason. Unsimulated: the call's own fixed gas limit.
   */
  public async buildUnsignedTransaction(
    from: string,
    call: EvmCall,
    nonce: number,
    simulate: boolean,
  ): Promise<EvmUnsignedTransaction> {
    const value = BigNumber.from(call.value ?? 0);
    let gasLimit = BigNumber.from(call.gasLimit);
    if (simulate) {
      let estimate: BigNumber;
      try {
        estimate = await this.provider.estimateGas({ from, to: call.to, data: call.data, value });
      } catch (e: any) {
        throw httpErrors.badRequest(
          `Simulation of the ${call.description} transaction failed, so it would revert on-chain: ` +
            `${simulationFailureReason(e)}`,
        );
      }
      gasLimit = estimate.mul(GAS_LIMIT_MARGIN_PCT).div(100);
    }
    const gas = await this.prepareGasOptions(undefined, gasLimit.toNumber());
    const tx: EvmUnsignedTransaction = {
      chainId: this.chainId,
      from,
      to: getAddress(call.to),
      data: call.data,
      value: value.toString(),
      nonce,
      gasLimit: gasLimit.toString(),
      type: gas.type,
    };
    if (gas.type === 2) {
      tx.maxFeePerGas = BigNumber.from(gas.maxFeePerGas).toString();
      tx.maxPriorityFeePerGas = BigNumber.from(gas.maxPriorityFeePerGas).toString();
    } else {
      tx.gasPrice = BigNumber.from(gas.gasPrice).toString();
    }
    return tx;
  }

  /** Broadcast a signed raw transaction, mapping node rejections to clear 400s. */
  public async broadcastSignedTransaction(signed: string): Promise<TransactionResponse> {
    try {
      return await this.provider.sendTransaction(signed);
    } catch (e: any) {
      const reason = e.error?.message ?? e.reason ?? e.message;
      if (e.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(reason)) {
        throw httpErrors.badRequest(
          `Insufficient ${this.nativeTokenSymbol} to pay for the transaction's gas and value: ${reason}`,
        );
      }
      if (e.code === 'NONCE_EXPIRED' || /nonce too low|already known|replacement/i.test(reason)) {
        throw httpErrors.badRequest(
          `The node refused the transaction's nonce (${reason}). Another transaction from this wallet used it; ` +
            'build the transaction again.',
        );
      }
      throw e;
    }
  }

  /**
   * Require an ERC-20 allowance before an operation that spends it.
   *
   * Execute refuses a short allowance with a 400 that says what to approve. Build records
   * the approve transaction instead, for the caller to send before the operation.
   */
  public async requireAllowance(
    owner: string,
    token: { address: string; symbol: string; decimals: number },
    spender: string,
    required: BigNumber,
    approveHint: string,
  ): Promise<void> {
    if (required.isZero()) return;
    const contract = new Contract(token.address, ERC20_ALLOWANCE_ABI, this.provider);
    const current: BigNumber = await contract.allowance(owner, spender);
    if (current.gte(required)) return;

    const build = getEvmBuildContext();
    if (!build) {
      throw httpErrors.badRequest(
        `Insufficient ${token.symbol} allowance for ${spender}: required ` +
          `${utils.formatUnits(required, token.decimals)}, current ${utils.formatUnits(current, token.decimals)}. ` +
          `Approve ${token.symbol} with POST /chains/ethereum/approve (spender: "${approveHint}").`,
      );
    }
    build.approvals.push({
      token: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      spender,
      required: required.toString(),
      current: current.toString(),
      call: {
        to: token.address,
        data: new utils.Interface(ERC20_APPROVE_ABI).encodeFunctionData('approve', [spender, required]),
        gasLimit: APPROVE_GAS_LIMIT,
        description: `${token.symbol} approve for ${spender}`,
      },
    });
  }

  /**
   * Require the two allowances a Universal Router swap spends through: the token's
   * ERC-20 allowance to Permit2, and Permit2's unexpired allowance to the router.
   * Execute refuses either one short; build records the approvals instead.
   */
  public async requirePermit2Allowance(
    owner: string,
    token: { address: string; symbol: string; decimals: number },
    router: string,
    required: BigNumber,
    approveHint: string,
  ): Promise<void> {
    await this.requireAllowance(owner, token, PERMIT2_ADDRESS, required, approveHint);

    const permit2 = new Contract(PERMIT2_ADDRESS, PERMIT2_ABI, this.provider);
    const [amount, expiration] = await permit2.allowance(owner, token.address, router);
    const expirationSeconds = Number(expiration);
    const expired = expirationSeconds > 0 && expirationSeconds < Math.floor(Date.now() / 1000);
    const current = expired ? BigNumber.from(0) : BigNumber.from(amount);
    if (current.gte(required)) return;

    const build = getEvmBuildContext();
    if (!build) {
      if (expired) {
        throw httpErrors.badRequest(
          `Permit2 allowance for ${token.symbol} to the router ${router} expired at ` +
            `${new Date(expirationSeconds * 1000).toISOString()}. ` +
            `Approve ${token.symbol} again with POST /chains/ethereum/approve (spender: "${approveHint}").`,
        );
      }
      throw httpErrors.badRequest(
        `Insufficient Permit2 allowance for ${token.symbol} to the router ${router}: required ` +
          `${utils.formatUnits(required, token.decimals)}, current ${utils.formatUnits(current, token.decimals)}. ` +
          `Approve ${token.symbol} with POST /chains/ethereum/approve (spender: "${approveHint}").`,
      );
    }
    build.approvals.push({
      token: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      spender: router,
      required: required.toString(),
      current: current.toString(),
      call: {
        to: PERMIT2_ADDRESS,
        data: new utils.Interface(PERMIT2_ABI).encodeFunctionData('approve', [
          token.address,
          router,
          required,
          MAX_UINT48,
        ]),
        gasLimit: APPROVE_GAS_LIMIT,
        description: `Permit2 approve of ${token.symbol} for ${router}`,
      },
    });
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
    robinhoodchain: {
      address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
      symbol: 'WETH',
      nativeSymbol: 'ETH',
    },
    unichain: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      nativeSymbol: 'ETH',
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
   * Get a wallet address example for schema documentation
   */
  public static async getWalletAddressExample(): Promise<string> {
    const chainConfig = getEthereumChainConfig();
    return chainConfig.defaultWallet;
  }

  // Check if the address is a valid EVM address
  public static isAddress(address: string): boolean {
    return ethers.utils.isAddress(address);
  }

  public async handleTransactionExecution(tx: TransactionResponse): Promise<providers.TransactionReceipt | null> {
    // Race the standard confirmation wait against the configured timeout.
    const raced = await Promise.race([
      tx.wait(1).then((receipt) => {
        // Transaction confirmed (status: 1) or failed/reverted (status: 0)
        logger.info(
          `Transaction ${tx.hash} ${receipt.status === 1 ? 'confirmed' : 'failed'} in block ${receipt.blockNumber}`,
        );
        return receipt;
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), this._transactionExecutionTimeoutMs)),
    ]);
    if (raced) {
      return raced;
    }

    // Timed out — the transaction is broadcast but not yet confirmed. Ethereum
    // blocks are ~12s, so a healthy tx can still need a few more blocks. Poll
    // the receipt over an extended window before concluding it is genuinely
    // pending; this avoids reporting a confirmed tx as a failure.
    // Note: Do NOT return a fake receipt with status: 0 — in Ethereum
    // receipt.status === 0 means "reverted/failed", not "pending".
    const extraWindowMs = 90_000;
    const pollIntervalMs = 5_000;
    logger.warn(
      `Transaction ${tx.hash} not confirmed within ${this._transactionExecutionTimeoutMs}ms — ` +
        `polling for receipt up to a further ${extraWindowMs}ms`,
    );
    const deadline = Date.now() + extraWindowMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const receipt = await this.getTransactionReceipt(tx.hash);
      if (receipt) {
        logger.info(
          `Transaction ${tx.hash} ${receipt.status === 1 ? 'confirmed' : 'failed'} ` +
            `in block ${receipt.blockNumber} (after extended poll)`,
        );
        return receipt;
      }
    }

    // Genuinely still pending — caller must handle null.
    logger.warn(`Transaction ${tx.hash} still pending after extended poll`);
    return null;
  }

  /**
   * Single confirmation gate for EVM liquidity and pool transactions (open/close position,
   * add/remove liquidity, collect fees, create pool, execute swap).
   *
   * `handleTransactionExecution` has three outcomes but only two of them are a valid response
   * body, so every caller used to have to remember two separate checks — and almost none did:
   *
   * - no receipt (still pending after the extended poll) — dereferencing it throws a TypeError
   *   that the route catch turns into a generic 500, losing the transaction hash and with it
   *   any chance of reconciling a transaction that lands a minute later.
   * - `receipt.status === 0` (reverted on-chain) — forwarding it verbatim as the response
   *   `status` reports the revert as {@link TransactionStatus.PENDING}, which is also 0, so a
   *   poller waits on it forever while the route's pre-send amounts are booked as if the
   *   tokens had moved.
   *
   * This helper resolves both:
   *
   * - still pending -> `{ confirmed: false, signature: tx.hash }`. The caller returns
   *   `{ signature, status: TransactionStatus.PENDING }` with NO `data` — the amounts it
   *   computed before sending have not moved and must not be reported as if they had.
   * - reverted -> throws the shared 400 TRANSACTION_FAILED, the same terminal, non-retryable
   *   error the Solana routes throw for a landed-but-failed transaction.
   * - confirmed -> `{ confirmed: true, signature, receipt, fee }`, fee already converted from
   *   gas units to the chain's native currency.
   */
  public async handleTransactionConfirmation(tx: TransactionResponse): Promise<EthereumTransactionOutcome> {
    const receipt = await this.handleTransactionExecution(tx);

    if (!receipt) {
      logger.warn(`Transaction ${tx.hash} still pending — reporting PENDING so the caller can reconcile it later`);
      return { confirmed: false, signature: tx.hash };
    }

    if (receipt.status === 0) {
      throw transactionFailed(
        `Transaction ${receipt.transactionHash} reverted on-chain. Gas was spent; no tokens moved.`,
      );
    }

    if (receipt.status !== 1) {
      // No status on the receipt (pre-Byzantium chain or a provider quirk): neither a
      // confirmation nor a revert, so report it as pending rather than guessing.
      logger.warn(`Transaction ${receipt.transactionHash} has no receipt status — reporting PENDING`);
      return { confirmed: false, signature: receipt.transactionHash };
    }

    return {
      confirmed: true,
      signature: receipt.transactionHash,
      receipt,
      fee: parseFloat(utils.formatUnits(receipt.gasUsed.mul(receipt.effectiveGasPrice), 18)),
    };
  }

  /**
   * Handle transaction confirmation status and return appropriate response
   * Similar to Solana's handleConfirmation helper
   * @param txReceipt Transaction receipt
   * @param inputToken Input token address
   * @param outputToken Output token address
   * @param expectedAmountIn Expected input amount
   * @param expectedAmountOut Expected output amount
   * @param side Trade side (optional)
   * @returns Response object with status and data
   */
  public handleExecuteQuoteTransactionConfirmation(
    txReceipt: providers.TransactionReceipt | null,
    inputToken: string,
    outputToken: string,
    expectedAmountIn: number,
    expectedAmountOut: number,
    side?: 'BUY' | 'SELL',
    txHash?: string, // Optional tx hash for pending transactions
    slippagePct?: number, // Slippage tolerance actually applied to the swap (echoed in data)
  ): {
    signature: string;
    status: number;
    data?: {
      tokenIn: string;
      tokenOut: string;
      amountIn: number;
      amountOut: number;
      fee: number;
      baseTokenBalanceChange: number;
      quoteTokenBalanceChange: number;
      slippagePct?: number;
    };
  } {
    if (!txReceipt) {
      // Transaction receipt not available - still pending
      logger.warn('Transaction pending, no receipt available yet');
      return {
        signature: txHash || '', // Use provided txHash for pending transactions
        status: 0, // PENDING (TransactionStatus.PENDING = 0)
        data: undefined,
      };
    }

    const signature = txReceipt.transactionHash;

    if (txReceipt.status === 0) {
      // Transaction failed on-chain
      logger.error(`Transaction ${signature} failed on-chain`);
      return {
        signature,
        status: -1, // FAILED (TransactionStatus.FAILED = -1)
        data: {
          tokenIn: inputToken,
          tokenOut: outputToken,
          amountIn: 0,
          amountOut: 0,
          fee: 0,
          baseTokenBalanceChange: 0,
          quoteTokenBalanceChange: 0,
        },
      };
    }

    if (txReceipt.status === 1) {
      // Transaction confirmed successfully
      // Calculate fee from gas used
      const fee = parseFloat(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString()) / 1e18;

      // Calculate balance changes based on side
      let baseTokenBalanceChange: number;
      let quoteTokenBalanceChange: number;

      if (side) {
        // For AMM/CLMM swaps with side information
        baseTokenBalanceChange = side === 'SELL' ? -expectedAmountIn : expectedAmountOut;
        quoteTokenBalanceChange = side === 'SELL' ? expectedAmountOut : -expectedAmountIn;
      } else {
        // For router swaps without side information
        baseTokenBalanceChange = -expectedAmountIn;
        quoteTokenBalanceChange = expectedAmountOut;
      }

      return {
        signature,
        status: 1, // CONFIRMED
        data: {
          tokenIn: inputToken,
          tokenOut: outputToken,
          amountIn: expectedAmountIn,
          amountOut: expectedAmountOut,
          fee,
          baseTokenBalanceChange,
          quoteTokenBalanceChange,
          slippagePct,
        },
      };
    }

    // Transaction is still pending (ethers returns status as undefined in some cases)
    logger.warn(`Transaction ${signature} status unclear, treating as pending`);
    return {
      signature,
      status: 0, // PENDING
      data: {
        tokenIn: inputToken,
        tokenOut: outputToken,
        amountIn: 0,
        amountOut: 0,
        fee: 0,
        baseTokenBalanceChange: 0,
        quoteTokenBalanceChange: 0,
      },
    };
  }

  /**
   * Get all token balances for an address
   * @param address Wallet address
   * @param tokens Optional array of token symbols/addresses to fetch. If not provided, fetches all tokens in token list
   * @returns Map of token symbol to balance
   */
  public async getBalances(address: string, tokens?: string[]): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};

    // Treat empty array as if no tokens were specified
    const effectiveTokens = tokens && tokens.length === 0 ? undefined : tokens;

    // Reads take the address: no key is loaded to read a balance.
    const nativeBalance = await this.getNativeBalanceByAddress(address);
    balances[this.nativeTokenSymbol] = parseFloat(tokenValueToString(nativeBalance));

    if (!effectiveTokens) {
      // No tokens specified, check all tokens in token list
      await this.getAllTokenBalances(address, balances);
    } else {
      // Get specific token balances
      await this.getSpecificTokenBalances(effectiveTokens, address, balances);
    }

    return balances;
  }

  /**
   * Get balances for all tokens in the token list
   * Processes tokens sequentially to prevent RPC timeouts
   */
  private async getAllTokenBalances(address: string, balances: Record<string, number>): Promise<void> {
    const tokenList = await this.getTokenList();
    logger.info(`Checking balances for all ${tokenList.length} tokens in the token list`);

    for (const token of tokenList) {
      try {
        const contract = this.getContract(token.address, this.provider);
        const balance = await this.getERC20BalanceByAddress(contract, address, token.decimals, 5000, token.symbol);

        const balanceNum = parseFloat(tokenValueToString(balance));

        // Only add tokens with non-zero balances
        if (balanceNum > 0) {
          balances[token.symbol] = balanceNum;
          logger.debug(`Found non-zero balance for ${token.symbol}: ${balanceNum}`);
        }
      } catch (err) {
        if ((err as any).statusCode === 429) {
          throw err;
        }
        logger.warn(`Error getting balance for ${token.symbol}: ${err.message}`);
      }
    }
  }

  /**
   * Get balances for specific tokens
   */
  private async getSpecificTokenBalances(
    tokens: string[],
    address: string,
    balances: Record<string, number>,
  ): Promise<void> {
    await Promise.all(
      tokens.map(async (symbolOrAddress) => {
        // Don't process native token again
        if (symbolOrAddress === this.nativeTokenSymbol) {
          return;
        }

        const token = await this.getToken(symbolOrAddress);
        if (token) {
          try {
            const contract = this.getContract(token.address, this.provider);
            const balance = await this.getERC20BalanceByAddress(contract, address, token.decimals, 5000, token.symbol);

            balances[token.symbol] = parseFloat(tokenValueToString(balance));
          } catch (err) {
            if ((err as any).statusCode === 429) {
              throw err;
            }
            logger.warn(`Error getting balance for ${token.symbol}: ${err.message}`);
            balances[token.symbol] = 0;
          }
        } else {
          logger.warn(`Token not recognized: ${symbolOrAddress}`);
          balances[symbolOrAddress] = 0;
        }
      }),
    );
  }
}

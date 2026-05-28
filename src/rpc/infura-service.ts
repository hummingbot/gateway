import { providers } from 'ethers';

import { logger } from '../services/logger';

import { createRateLimitAwareEthereumProvider } from './rpc-connection-interceptor';
import { RPCProvider, RPCProviderConfig, NetworkInfo } from './rpc-provider-base';

/**
 * Infura Service - Optimized RPC provider for Ethereum/EVM networks
 * Extends RPCProvider base class with Ethereum-specific features
 *
 * Features:
 * - Support for 30+ Ethereum networks and testnets
 * - HTTP provider for all RPC calls
 * - Automatic network endpoint mapping
 * - Health check capabilities
 *
 * Note: Ethereum uses polling via eth_getTransactionReceipt for transaction confirmation
 */
export class InfuraService extends RPCProvider {
  private provider!: providers.JsonRpcProvider;

  constructor(config: RPCProviderConfig, networkInfo: NetworkInfo) {
    super(config, networkInfo);

    if (networkInfo.chain !== 'ethereum') {
      throw new Error('InfuraService only supports Ethereum networks');
    }

    this.initializeHttpProvider();
  }

  /**
   * Get the Infura HTTP RPC URL for the current network
   */
  public override getHttpUrl(): string {
    const network = this.getInfuraNetworkName();
    return `https://${network}.infura.io/v3/${this.config.apiKey}`;
  }

  /**
   * Get the WebSocket URL - not used for Ethereum
   * Ethereum uses polling via eth_getTransactionReceipt
   */
  public getWebSocketUrl(): string | null {
    return null;
  }

  /**
   * Initialize HTTP provider
   */
  private initializeHttpProvider(): void {
    const httpUrl = this.getHttpUrl();

    // Initialize HTTP provider with rate limit detection
    this.provider = createRateLimitAwareEthereumProvider(
      new providers.JsonRpcProvider(httpUrl, {
        name: this.getInfuraNetworkName(),
        chainId: this.networkInfo.chainId,
      }),
      httpUrl,
    );
  }

  /**
   * Initialize the service
   */
  public async initialize(): Promise<void> {
    logger.info(`Infura service initialized for ${this.getInfuraNetworkName()}`);
  }

  /**
   * Map chainId to Infura network name
   */
  private static readonly NETWORK_MAP: Record<number, string> = {
    // Mainnets
    1: 'mainnet',
    10: 'optimism-mainnet',
    56: 'bsc-mainnet',
    137: 'polygon-mainnet',
    324: 'zksync-mainnet',
    534352: 'scroll-mainnet',
    5000: 'mantle-mainnet',
    8453: 'base-mainnet',
    42161: 'arbitrum-mainnet',
    42220: 'celo-mainnet',
    43114: 'avalanche-mainnet',
    59144: 'linea-mainnet',
    81457: 'blast-mainnet',
    204: 'opbnb-mainnet',
    11297108109: 'palm-mainnet',
    // Testnets
    11155111: 'sepolia',
    421614: 'arbitrum-sepolia',
    43113: 'avalanche-fuji',
    84532: 'base-sepolia',
    168587773: 'blast-sepolia',
    97: 'bsc-testnet',
    44787: 'celo-alfajores',
    59141: 'linea-sepolia',
    5003: 'mantle-sepolia',
    5611: 'opbnb-testnet',
    11155420: 'optimism-sepolia',
    11297108099: 'palm-testnet',
    80002: 'polygon-amoy',
    534351: 'scroll-sepolia',
    300: 'zksync-sepolia',
  };

  /**
   * Get the Infura network name for the current chainId
   */
  private getInfuraNetworkName(): string {
    const network = InfuraService.NETWORK_MAP[this.networkInfo.chainId];
    if (!network) {
      throw new Error(`Infura network not supported for chainID: ${this.networkInfo.chainId}`);
    }
    return network;
  }

  /**
   * Get the HTTP provider
   */
  public getProvider(): providers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Health check - verify RPC connection
   */
  public override async healthCheck(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      logger.debug(`Infura health check passed for ${this.getInfuraNetworkName()}`);
      return true;
    } catch (error: any) {
      logger.error(`Infura health check failed for ${this.getInfuraNetworkName()}: ${error.message}`);
      return false;
    }
  }

  /**
   * Disconnect and clean up resources
   */
  public disconnect(): void {
    if (this.provider && 'destroy' in this.provider) {
      (this.provider as any).destroy();
    }
  }
}

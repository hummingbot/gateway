import { providers } from 'ethers';

import { logger } from '../../services/logger';

import { EthereumNetworkConfig } from './ethereum.config';

/**
 * Infura Service - Provides optimized RPC connectivity for Ethereum networks
 * Supports both HTTP and WebSocket connections for real-time events
 */
export class InfuraService {
  private config: EthereumNetworkConfig;
  private provider: providers.JsonRpcProvider | providers.WebSocketProvider;
  private wsProvider?: providers.WebSocketProvider;

  constructor(config: EthereumNetworkConfig) {
    this.config = config;
    this.initializeProvider();
  }

  /**
   * Get the Infura RPC URL for a specific network
   */
  public getUrlForNetwork(_network: string): string {
    return this.getInfuraHttpUrl();
  }

  /**
   * Initialize HTTP and WebSocket providers
   */
  private initializeProvider(): void {
    const httpUrl = this.getInfuraHttpUrl();

    // Initialize HTTP provider
    this.provider = new providers.JsonRpcProvider(httpUrl, {
      name: this.getNetworkName(),
      chainId: this.config.chainID,
    });

    // Initialize WebSocket provider if enabled
    if (this.shouldUseWebSocket()) {
      try {
        const wsUrl = this.getInfuraWebSocketUrl();
        this.wsProvider = new providers.WebSocketProvider(wsUrl);
        logger.info(`✅ Infura WebSocket provider initialized for ${this.getNetworkName()}`);
      } catch (error: any) {
        logger.warn(`Failed to initialize Infura WebSocket: ${error.message}, using HTTP only`);
      }
    }
  }

  /**
   * Get Infura HTTP URL for the current network
   */
  private getInfuraHttpUrl(): string {
    const network = this.getInfuraNetworkName();
    return `https://${network}.infura.io/v3/${this.config.infuraAPIKey}`;
  }

  /**
   * Get Infura WebSocket URL for the current network
   */
  private getInfuraWebSocketUrl(): string {
    const network = this.getInfuraNetworkName();
    return `wss://${network}.infura.io/ws/v3/${this.config.infuraAPIKey}`;
  }

  /**
   * Map chainId to Infura network name
   */
  private getInfuraNetworkName(): string {
    const networkMap: Record<number, string> = {
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

    const network = networkMap[this.config.chainID];
    if (!network) {
      throw new Error(`Infura network not supported for chainID: ${this.config.chainID}`);
    }

    return network;
  }

  /**
   * Get human-readable network name
   */
  private getNetworkName(): string {
    const nameMap: Record<number, string> = {
      // Mainnets
      1: 'Ethereum Mainnet',
      10: 'Optimism',
      56: 'BSC',
      137: 'Polygon',
      324: 'ZKsync Era',
      534352: 'Scroll',
      5000: 'Mantle',
      8453: 'Base',
      42161: 'Arbitrum',
      42220: 'Celo',
      43114: 'Avalanche',
      59144: 'Linea',
      81457: 'Blast',
      204: 'opBNB',
      11297108109: 'Palm',
      // Testnets
      11155111: 'Sepolia',
      421614: 'Arbitrum Sepolia',
      43113: 'Avalanche Fuji',
      84532: 'Base Sepolia',
      168587773: 'Blast Sepolia',
      97: 'BSC Testnet',
      44787: 'Celo Alfajores',
      59141: 'Linea Sepolia',
      5003: 'Mantle Sepolia',
      5611: 'opBNB Testnet',
      11155420: 'Optimism Sepolia',
      11297108099: 'Palm Testnet',
      80002: 'Polygon Amoy',
      534351: 'Scroll Sepolia',
      300: 'ZKsync Sepolia',
    };

    return nameMap[this.config.chainID] || `Chain ${this.config.chainID}`;
  }

  /**
   * Get the configured provider (WebSocket if available, otherwise HTTP)
   */
  public getProvider(): providers.JsonRpcProvider | providers.WebSocketProvider {
    return this.wsProvider || this.provider;
  }

  /**
   * Check if WebSocket should be used
   */
  private shouldUseWebSocket(): boolean {
    return (
      this.config.useInfuraWebSocket &&
      this.config.infuraAPIKey &&
      this.config.infuraAPIKey.trim() !== '' &&
      this.config.infuraAPIKey !== 'INFURA_API_KEY'
    );
  }

  /**
   * Health check - verify RPC connection
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      logger.debug(`Infura health check passed for ${this.getNetworkName()}`);
      return true;
    } catch (error: any) {
      logger.error(`Infura health check failed for ${this.getNetworkName()}: ${error.message}`);
      return false;
    }
  }

  /**
   * Disconnect and clean up resources
   */
  public disconnect(): void {
    if (this.wsProvider) {
      this.wsProvider.destroy();
      logger.info(`Infura WebSocket disconnected for ${this.getNetworkName()}`);
    }

    if (this.provider && 'destroy' in this.provider) {
      (this.provider as any).destroy();
    }
  }
}

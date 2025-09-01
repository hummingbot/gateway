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
      1: 'mainnet',
      137: 'polygon-mainnet',
      42161: 'arbitrum-mainnet',
      10: 'optimism-mainnet',
      8453: 'base-mainnet',
      43114: 'avalanche-mainnet',
      11155111: 'sepolia',
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
      1: 'Ethereum Mainnet',
      137: 'Polygon',
      42161: 'Arbitrum',
      10: 'Optimism',
      8453: 'Base',
      43114: 'Avalanche',
      11155111: 'Sepolia',
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

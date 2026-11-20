import { logger } from '../services/logger';

import { RPCProvider, RPCProviderConfig, NetworkInfo } from './rpc-provider-base';

/**
 * Infura Solana Service - Infura HTTP RPC provider for Solana networks
 *
 * Uses the same `apiKeys.infura` key as the Ethereum Infura provider.
 * Infura serves Solana JSON-RPC over HTTPS only, so transaction confirmation
 * uses the standard polling path (no WebSocket monitoring).
 *
 * @see https://docs.infura.io/reference/solana
 */
export class InfuraSolanaService extends RPCProvider {
  /**
   * Map Gateway Solana network names to Infura subdomains
   */
  private static readonly NETWORK_MAP: Record<string, string> = {
    'mainnet-beta': 'solana-mainnet',
    devnet: 'solana-devnet',
  };

  constructor(config: RPCProviderConfig, networkInfo: NetworkInfo) {
    super(config, networkInfo);

    if (networkInfo.chain !== 'solana') {
      throw new Error('InfuraSolanaService only supports Solana networks');
    }
    if (!this.isApiKeyValid()) {
      throw new Error(
        `Solana rpcProvider is 'infura' but apiKeys.infura is not set. Add your Infura API key to conf/apiKeys.yml or set rpcProvider to 'url'.`,
      );
    }
    // Validate the network eagerly so an unsupported network fails at construction
    this.getInfuraNetworkName();
  }

  public override getHttpUrl(): string {
    return `https://${this.getInfuraNetworkName()}.infura.io/v3/${this.config.apiKey}`;
  }

  /**
   * Infura does not offer a Solana WebSocket endpoint
   */
  public getWebSocketUrl(): string | null {
    return null;
  }

  public async initialize(): Promise<void> {
    logger.info(`Infura service initialized for ${this.getInfuraNetworkName()}`);
  }

  private getInfuraNetworkName(): string {
    const network = InfuraSolanaService.NETWORK_MAP[this.networkInfo.network];
    if (!network) {
      throw new Error(
        `Infura does not support Solana network '${this.networkInfo.network}'. Supported: ${Object.keys(InfuraSolanaService.NETWORK_MAP).join(', ')}`,
      );
    }
    return network;
  }

  public disconnect(): void {
    // HTTP only: nothing to clean up
  }
}

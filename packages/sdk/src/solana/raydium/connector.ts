/**
 * Raydium Connector - SDK Implementation
 *
 * Implements the Protocol interface for Raydium DEX.
 * Provides SDK access to Raydium AMM and CLMM operations.
 */

import {
  Protocol,
  ProtocolType,
  ChainType,
  ProtocolMetadata,
} from '../../../../core/src/types/protocol';

import { AddLiquidityOperation } from './add-liquidity-operation';

// Import existing Gateway Raydium and Solana classes
// These will be refactored in future PRs
import { Raydium } from '../../../../../src/connectors/raydium/raydium';
import { Solana } from '../../../../../src/chains/solana/solana';

/**
 * Raydium Connector Configuration
 */
export interface RaydiumConnectorConfig {
  network: string;
}

/**
 * Raydium SDK Connector
 *
 * Implements the Protocol interface to provide SDK access to Raydium.
 * This is the main entry point for using Raydium through the SDK.
 *
 * Usage:
 * ```typescript
 * const raydium = await RaydiumConnector.getInstance('mainnet-beta');
 * const tx = await raydium.operations.addLiquidity.build({
 *   poolAddress: '...',
 *   walletAddress: '...',
 *   baseTokenAmount: 100,
 *   quoteTokenAmount: 200,
 * });
 * ```
 */
export class RaydiumConnector implements Protocol<RaydiumConnectorConfig> {
  private static _instances: { [network: string]: RaydiumConnector } = {};

  // Protocol metadata
  readonly name = 'raydium';
  readonly chain = ChainType.SOLANA;
  readonly network: string;
  readonly protocolType = ProtocolType.DEX_AMM;
  readonly version = 'v2';

  // Internal Gateway instances (will be refactored in future PRs)
  private raydium: Raydium;
  private solana: Solana;
  private initialized = false;

  /**
   * Operations - Mutable actions that build transactions
   */
  readonly operations: {
    addLiquidity: AddLiquidityOperation;
    // More operations will be added in PR #2:
    // removeLiquidity, swap, quoteLiquidity, etc.
  };

  /**
   * Queries - Read-only data fetching
   */
  readonly queries = {
    /**
     * Get pool information
     */
    getPool: async (params: { poolAddress: string }) => {
      const poolInfo = await this.raydium.getAmmPoolInfo(params.poolAddress);
      return poolInfo;
    },

    /**
     * Get position information
     */
    getPosition: async (_params: { poolAddress: string; walletAddress: string }) => {
      // This would fetch user's position in the pool
      // Implementation depends on pool type (AMM vs CLMM)
      throw new Error('getPosition not yet implemented');
    },
  };

  /**
   * Private constructor - use getInstance()
   */
  private constructor(network: string) {
    this.network = network;
  }

  /**
   * Get singleton instance of RaydiumConnector
   *
   * @param network - Solana network ('mainnet-beta', 'devnet')
   * @returns RaydiumConnector instance
   */
  public static async getInstance(network: string): Promise<RaydiumConnector> {
    if (!RaydiumConnector._instances[network]) {
      const instance = new RaydiumConnector(network);
      await instance.initialize({ network });
      RaydiumConnector._instances[network] = instance;
    }
    return RaydiumConnector._instances[network];
  }

  /**
   * Initialize the connector
   */
  async initialize(config: RaydiumConnectorConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize existing Gateway classes
    // These provide the underlying blockchain interaction
    this.solana = await Solana.getInstance(config.network);
    this.raydium = await Raydium.getInstance(config.network);

    // Initialize operations
    // Each operation receives references to the underlying services
    (this.operations as any) = {
      addLiquidity: new AddLiquidityOperation(this.raydium, this.solana),
      // More operations will be initialized in PR #2
    };

    this.initialized = true;
  }

  /**
   * Health check - verify connector is operational
   */
  async healthCheck(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      // Check if we can connect to Solana RPC
      const blockHeight = await this.solana.connection.getBlockHeight();
      return blockHeight > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get protocol metadata
   */
  getMetadata(): ProtocolMetadata {
    return {
      name: this.name,
      displayName: 'Raydium',
      description: 'Raydium AMM and CLMM DEX on Solana',
      chain: this.chain,
      network: this.network,
      protocolType: this.protocolType,
      version: this.version,
      website: 'https://raydium.io',
      documentation: 'https://docs.raydium.io',
      supportedOperations: [
        'addLiquidity',
        // More will be added in PR #2:
        // 'removeLiquidity', 'swap', 'quoteLiquidity', 'createPool', etc.
      ],
      availableQueries: [
        'getPool',
        'getPosition',
      ],
    };
  }

  /**
   * Get the underlying Raydium instance
   * (For internal use and migration purposes)
   * @internal
   */
  getRaydiumInstance(): Raydium {
    return this.raydium;
  }

  /**
   * Get the underlying Solana instance
   * (For internal use and migration purposes)
   * @internal
   */
  getSolanaInstance(): Solana {
    return this.solana;
  }
}

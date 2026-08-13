import { fetchPositionsForOwner, setNativeMintWrappingStrategy, type WhirlpoolDeployment } from '@orca-so/whirlpools';
import { fetchWhirlpool, fetchPosition } from '@orca-so/whirlpools-client';
import { address, createSolanaRpc, mainnet, devnet } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { PositionInfo } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { OrcaConfig } from './orca.config';
import { getPositionDetails } from './orca.position';
import { getOrcaDeployment } from './orca.sdk';
import { OrcaPoolInfo } from './schemas';

export class Orca {
  private static _instances: { [name: string]: Orca };
  private solana: Solana;
  public config: OrcaConfig.RootConfig;
  public solanaKitRpc: any;
  public deployment: WhirlpoolDeployment;

  private constructor() {
    this.config = OrcaConfig.config;
    this.solana = null; // Initialize as null since we need to await getInstance
    this.deployment = getOrcaDeployment('mainnet-beta');
  }

  /** Gets singleton instance of Orca */
  public static async getInstance(network: string): Promise<Orca> {
    if (!Orca._instances) {
      Orca._instances = {};
    }
    if (!Orca._instances[network]) {
      const instance = new Orca();
      await instance.init(network);
      Orca._instances[network] = instance;
    }
    return Orca._instances[network];
  }

  /** Initializes Orca instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network);
      this.deployment = getOrcaDeployment(this.solana.network);
      setNativeMintWrappingStrategy('ata');

      if (this.solana.network === 'mainnet-beta') {
        this.solanaKitRpc = createSolanaRpc(mainnet(this.solana.connection.rpcEndpoint));
      } else {
        this.solanaKitRpc = createSolanaRpc(devnet(this.solana.connection.rpcEndpoint));
      }

      logger.info('Orca connector initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Orca:', error);
      throw error;
    }
  }

  /**
   * Fetches pools from Orca API and maps them to OrcaPoolInfo format
   * @param options Fetch options
   * @returns Array of OrcaPoolInfo objects
   */
  async getPools(
    options: {
      limit?: number;
      query?: string;
      sortBy?: string;
      sortDirection?: string;
      verifiedOnly?: boolean;
    } = {},
  ): Promise<OrcaPoolInfo[]> {
    const { limit = 50, query, sortBy = 'volume', sortDirection = 'desc', verifiedOnly = false } = options;

    try {
      let baseUrl: string;
      if (this.solana.network === 'mainnet-beta') {
        baseUrl = 'https://api.orca.so/v2/solana/pools/search';
      } else {
        baseUrl = 'https://api.devnet.orca.so/v2/solana/pools/search';
      }

      const params = new URLSearchParams();

      if (query) {
        params.append('q', query);
      }
      if (limit) {
        params.append('size', limit.toString());
      }
      if (sortBy) {
        params.append('sortBy', sortBy);
      }
      if (sortDirection) {
        params.append('sortDirection', sortDirection);
      }
      if (verifiedOnly) {
        params.append('verifiedOnly', 'true');
      }

      const url = `${baseUrl}?${params.toString()}`;
      logger.info(`Fetching Orca pools from API: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Orca API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const pools = data.data || [];

      // Map API response to OrcaPoolInfo format
      return pools.map((pool: any) => this.mapApiPoolToPoolInfo(pool));
    } catch (error) {
      logger.error('Error fetching pools from Orca API:', error);
      throw error;
    }
  }

  /**
   * Fetches raw pool data from Orca API (for fetch-pools endpoint)
   * Returns raw API response without mapping to OrcaPoolInfo
   */
  async fetchPoolsFromApi(
    options: {
      limit?: number;
      query?: string;
      sortBy?: string;
      sortDirection?: string;
      verifiedOnly?: boolean;
    } = {},
  ): Promise<any[]> {
    const { limit = 50, query, sortBy = 'volume', sortDirection = 'desc', verifiedOnly = false } = options;

    try {
      let baseUrl: string;
      if (this.solana.network === 'mainnet-beta') {
        baseUrl = 'https://api.orca.so/v2/solana/pools/search';
      } else {
        baseUrl = 'https://api.devnet.orca.so/v2/solana/pools/search';
      }

      const params = new URLSearchParams();

      if (query) {
        params.append('q', query);
      }
      if (limit) {
        params.append('size', limit.toString());
      }
      if (sortBy) {
        params.append('sortBy', sortBy);
      }
      if (sortDirection) {
        params.append('sortDirection', sortDirection);
      }
      if (verifiedOnly) {
        params.append('verifiedOnly', 'true');
      }

      const url = `${baseUrl}?${params.toString()}`;
      logger.info(`Fetching Orca pools from API: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Orca API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      logger.error('Error fetching pools from Orca API:', error);
      throw error;
    }
  }

  /**
   * Maps Orca API v2 pool data to OrcaPoolInfo format
   * @param apiPool Pool data from Orca API v2
   * @returns OrcaPoolInfo object
   */
  private mapApiPoolToPoolInfo(apiPool: any): OrcaPoolInfo {
    // Convert fee rate (stored in hundredths of basis points)
    // 400 = 4 basis points = 0.04%
    const feePct = Number(apiPool.feeRate) / 10000;
    const protocolFeeRate = Number(apiPool.protocolFeeRate) / 10000;

    return {
      address: apiPool.address,
      baseTokenAddress: apiPool.tokenMintA,
      quoteTokenAddress: apiPool.tokenMintB,
      binStep: apiPool.tickSpacing,
      feePct,
      price: Number(apiPool.price),
      baseTokenAmount: Number(apiPool.tokenBalanceA) / Math.pow(10, apiPool.tokenA.decimals),
      quoteTokenAmount: Number(apiPool.tokenBalanceB) / Math.pow(10, apiPool.tokenB.decimals),
      activeBinId: apiPool.tickCurrentIndex,
      // Orca-specific fields
      liquidity: apiPool.liquidity,
      sqrtPrice: apiPool.sqrtPrice,
      tvlUsdc: apiPool.tvlUsdc,
      protocolFeeRate,
      yieldOverTvl: Number(apiPool.yieldOverTvl),
    };
  }

  /**
   * Gets comprehensive pool information for a Whirlpool using Orca API v2
   * @param poolAddress The whirlpool address
   * @returns OrcaPoolInfo or null if not found
   */
  async getPoolInfo(poolAddress: string): Promise<OrcaPoolInfo | null> {
    try {
      let baseUrl: string;
      if (this.solana.network === 'mainnet-beta') {
        baseUrl = 'https://api.orca.so/v2/solana/pools/search';
      } else {
        baseUrl = 'https://api.devnet.orca.so/v2/solana/pools/search';
      }
      const params = new URLSearchParams();

      // Search by pool address
      params.append('q', poolAddress);
      params.append('size', '1');

      const url = `${baseUrl}?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Orca API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const pools = data.data || [];

      if (pools.length === 0) {
        logger.error(`Pool not found: ${poolAddress}`);
        return null;
      }

      // Map the first result to OrcaPoolInfo format
      return this.mapApiPoolToPoolInfo(pools[0]);
    } catch (error) {
      logger.error(`Error getting pool info for ${poolAddress}:`, error);
      return null;
    }
  }

  /**
   * Gets whirlpool data
   * This fetches the whirlpool account and returns the data
   * @param poolAddress The whirlpool address
   * @returns Whirlpool account data
   */
  async getWhirlpool(poolAddress: string): Promise<any> {
    try {
      const rpc = this.solanaKitRpc;
      const poolAddr = address(poolAddress);
      const whirlpool = await fetchWhirlpool(rpc, poolAddr);

      if (!whirlpool.data) {
        throw new Error(`Whirlpool not found: ${poolAddress}`);
      }

      return whirlpool.data;
    } catch (error) {
      logger.error(`Error fetching whirlpool ${poolAddress}:`, error);
      throw error;
    }
  }

  /**
   * Gets raw position data for a position address
   * @param positionAddress The position PDA address
   * @param _walletAddress The wallet that owns the position (not used in Orca, kept for API compatibility)
   * @returns Position data with pool info
   */
  async getRawPosition(positionAddress: string, _walletAddress: PublicKey) {
    try {
      const rpc = this.solanaKitRpc;
      // Fetch position account
      const position = await fetchPosition(rpc, address(positionAddress));

      if (!position.data) {
        throw new Error(`Position not found: ${positionAddress}`);
      }

      const pos = position.data;
      const poolAddress = pos.whirlpool.toString();

      // Fetch the whirlpool data
      const whirlpool = await this.getWhirlpool(poolAddress);

      return {
        position: pos,
        poolAddress,
        whirlpool,
        publicKey: new PublicKey(poolAddress),
      };
    } catch (error) {
      logger.error('Error getting raw position:', error);
      return null;
    }
  }

  /**
   * Gets all positions owned by a wallet
   * @param poolAddress The whirlpool address
   * @param walletAddress The wallet public key
   * @returns Array of PositionInfo
   */
  async getPositionsForWalletAddress(walletAddress: string): Promise<PositionInfo[]> {
    try {
      logger.info(`Getting positions for wallet ${walletAddress}`);

      const positions: PositionInfo[] = [];

      const positionsForOwner = await fetchPositionsForOwner(
        this.solanaKitRpc,
        address(walletAddress),
        this.deployment,
      );

      for (const position of positionsForOwner) {
        if (position.isPositionBundle) {
          continue;
        }
        try {
          const positionDetails = await getPositionDetails(
            this.solanaKitRpc,
            position.address.toString(),
            this.deployment,
          );
          positions.push(positionDetails);
        } catch (positionError: any) {
          // Skip positions that fail to fetch (e.g., closed positions, invalid data)
          // Only log as debug since this is expected for closed positions
          if (positionError.statusCode === 404) {
            logger.debug(`Position ${position.address} appears to be closed, skipping`);
          } else {
            logger.warn(`Error fetching position ${position.address}: ${positionError.message}`);
          }
        }
      }

      return positions;
    } catch (error) {
      logger.error('Error getting positions in pool:', error);
      return [];
    }
  }

  /**
   * Gets position information for a specific position NFT
   * @param positionAddress The position address
   * @param walletAddress The wallet that owns the position
   * @returns PositionInfo or null if not found
   */
  async getPositionInfo(positionAddress: string, _walletAddress: string): Promise<PositionInfo | null> {
    // Validate position address
    try {
      new PublicKey(positionAddress);
    } catch {
      throw httpErrors.badRequest(`Invalid position address: ${positionAddress}`);
    }

    try {
      const positionInfo = await getPositionDetails(this.solanaKitRpc, positionAddress, this.deployment);
      return positionInfo;
    } catch (error) {
      logger.error('Error getting position info:', error);
      return null;
    }
  }
}

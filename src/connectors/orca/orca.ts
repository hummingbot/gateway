import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { fetchPositionsForOwner } from '@orca-so/whirlpools';
import { fetchWhirlpool, fetchPosition } from '@orca-so/whirlpools-client';
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  WhirlpoolClient,
} from '@orca-so/whirlpools-sdk';
import { address, createSolanaRpc, mainnet, devnet } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { PositionInfo } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { OrcaConfig } from './orca.config';
import { getPositionDetails } from './orca.utils';
import { OrcaPosition, OrcaPoolInfo } from './schemas';

export class Orca {
  private static _instances: { [name: string]: Orca };
  private solana: Solana;
  protected whirlpoolContextMap: { [key: string]: WhirlpoolContext };
  protected whirlpoolClientMap: { [key: string]: WhirlpoolClient };
  public config: OrcaConfig.RootConfig;
  public solanaKitRpc: any;

  private constructor() {
    this.config = OrcaConfig.config;
    this.solana = null; // Initialize as null since we need to await getInstance
    this.whirlpoolContextMap = {}; // key: wallet address, value: WhirlpoolContext
    this.whirlpoolClientMap = {}; // key: wallet address, value: WhirlpoolClient
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

  async getWhirlpoolContextForWallet(walletAddress: string): Promise<WhirlpoolContext> {
    if (!this.whirlpoolContextMap[walletAddress]) {
      const walletKeypair = await this.solana.getWallet(walletAddress);
      const wallet = new Wallet(walletKeypair);
      const provider = new AnchorProvider(this.solana.connection, wallet, {
        commitment: 'processed',
      });
      this.whirlpoolContextMap[walletAddress] = WhirlpoolContext.withProvider(provider);
    }
    return this.whirlpoolContextMap[walletAddress];
  }

  async getWhirlpoolClientForWallet(walletAddress: string): Promise<WhirlpoolClient> {
    if (!this.whirlpoolClientMap[walletAddress]) {
      const context = await this.getWhirlpoolContextForWallet(walletAddress);
      this.whirlpoolClientMap[walletAddress] = buildWhirlpoolClient(context);
    }
    return this.whirlpoolClientMap[walletAddress];
  }

  /**
   * Fetches pools from Orca API and maps them to OrcaPoolInfo format
   * @param limit Maximum number of pools to return (maps to 'size' parameter)
   * @param tokenSymbolA Optional first token symbol (e.g., 'SOL')
   * @param tokenSymbolB Optional second token symbol (e.g., 'USDC')
   * @returns Array of OrcaPoolInfo objects
   */
  async getPools(limit?: number, tokenSymbolA?: string, tokenSymbolB?: string): Promise<OrcaPoolInfo[]> {
    try {
      let baseUrl: string;
      if (this.solana.network === 'mainnet-beta') {
        baseUrl = 'https://api.orca.so/v2/solana/pools/search';
      } else {
        baseUrl = 'https://api.devnet.orca.so/v2/solana/pools/search';
      }

      const params = new URLSearchParams();

      // Build search query from token symbols
      if (tokenSymbolA && tokenSymbolB) {
        params.append('q', `${tokenSymbolA} ${tokenSymbolB}`);
      } else if (tokenSymbolA) {
        params.append('q', tokenSymbolA);
      } else if (tokenSymbolB) {
        params.append('q', tokenSymbolB);
      }

      // Add size parameter (limit)
      if (limit) {
        params.append('size', limit.toString());
      }

      const url = `${baseUrl}?${params.toString()}`;
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
   * @param positionAddress The position NFT mint address
   * @param _walletAddress The wallet that owns the position (not used in Orca, kept for API compatibility)
   * @returns Position data with pool info
   */
  async getRawPosition(positionAddress: string, _walletAddress: PublicKey) {
    try {
      const rpc = this.solanaKitRpc;
      const positionMint = address(positionAddress);

      // Fetch position account
      const position = await fetchPosition(rpc, positionMint);

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

      const positionsForOwner: OrcaPosition[] = (await fetchPositionsForOwner(
        this.solanaKitRpc,
        address(walletAddress),
      )) as any;

      const client = await this.getWhirlpoolClientForWallet(walletAddress);

      for (const position of positionsForOwner) {
        positions.push(await getPositionDetails(client, address(position.address)));
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
  async getPositionInfo(positionAddress: string, walletAddress: string): Promise<PositionInfo | null> {
    // Validate position address
    try {
      new PublicKey(positionAddress);
    } catch {
      throw httpErrors.badRequest(`Invalid position address: ${positionAddress}`);
    }

    try {
      const client = await this.getWhirlpoolClientForWallet(walletAddress);
      const positionInfo = await getPositionDetails(client, positionAddress);
      return positionInfo;
    } catch (error) {
      logger.error('Error getting position info:', error);
      return null;
    }
  }
}

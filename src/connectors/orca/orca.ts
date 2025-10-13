import { fetchWhirlpool, fetchPosition } from '@orca-so/whirlpools-client';
import { Address } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { OrcaPoolInfo, PositionInfo } from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

import { OrcaConfig } from './orca.config';

export class Orca {
  private static _instances: { [name: string]: Orca };
  private solana: Solana;
  public config: OrcaConfig.RootConfig;

  private constructor() {
    this.config = OrcaConfig.config;
    this.solana = null; // Initialize as null since we need to await getInstance
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
      logger.info('Orca connector initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Orca:', error);
      throw error;
    }
  }

  /**
   * Fetches pools from Orca API
   * @param limit Maximum number of pools to return
   * @param tokenMintA Optional first token mint address
   * @param tokenMintB Optional second token mint address
   * @returns Array of pool addresses/info
   */
  async getPools(limit?: number, tokenMintA?: string, tokenMintB?: string): Promise<any[]> {
    try {
      const baseUrl = 'https://api.orca.so/v1/whirlpool/list';
      const params = new URLSearchParams();

      if (tokenMintA) params.append('tokenA', tokenMintA);
      if (tokenMintB) params.append('tokenB', tokenMintB);

      const url = `${baseUrl}?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Orca API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const pools = data.whirlpools || [];

      // Apply limit if specified
      return limit ? pools.slice(0, limit) : pools;
    } catch (error) {
      logger.error('Error fetching pools from Orca API:', error);
      throw error;
    }
  }

  /**
   * Gets comprehensive pool information for a Whirlpool
   * @param poolAddress The whirlpool address
   * @returns OrcaPoolInfo or null if not found
   */
  async getPoolInfo(poolAddress: string): Promise<OrcaPoolInfo | null> {
    try {
      const rpc = this.solana.solanaKitRpc;
      const poolAddr = poolAddress as Address;

      // Fetch whirlpool account data
      const whirlpool = await fetchWhirlpool(rpc, poolAddr);

      if (!whirlpool.data) {
        logger.error(`Whirlpool not found: ${poolAddress}`);
        return null;
      }

      const pool = whirlpool.data;

      // Fetch token vault balances
      const [vaultABalance, vaultBBalance] = await Promise.all([
        this.solana.connection.getTokenAccountBalance(new PublicKey(pool.tokenVaultA)),
        this.solana.connection.getTokenAccountBalance(new PublicKey(pool.tokenVaultB)),
      ]);

      // Calculate price from sqrtPrice
      // Price = (sqrtPrice / 2^64)^2
      const sqrtPrice = BigInt(pool.sqrtPrice);
      const Q64 = BigInt(2 ** 64);
      const price = Number(sqrtPrice * sqrtPrice) / Number(Q64 * Q64);

      // Convert fee rate (stored in hundredths of basis points)
      // 300 = 3 basis points = 0.03%
      const feePct = Number(pool.feeRate) / 10000;
      const protocolFeePct = Number(pool.protocolFeeRate) / 10000;

      return {
        address: poolAddress,
        baseTokenAddress: pool.tokenMintA.toString(),
        quoteTokenAddress: pool.tokenMintB.toString(),
        binStep: pool.tickSpacing, // Map tickSpacing to binStep (universal abstraction)
        feePct,
        price,
        baseTokenAmount: vaultABalance.value.uiAmount || 0,
        quoteTokenAmount: vaultBBalance.value.uiAmount || 0,
        activeBinId: pool.tickCurrentIndex, // Map tickCurrentIndex to activeBinId (universal abstraction)
        // Orca-specific fields
        tickSpacing: pool.tickSpacing,
        protocolFeePct,
        liquidity: pool.liquidity.toString(),
        sqrtPrice: pool.sqrtPrice.toString(),
      };
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
      const rpc = this.solana.solanaKitRpc;
      const poolAddr = poolAddress as Address;
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
      const rpc = this.solana.solanaKitRpc;
      const positionMint = positionAddress as Address;

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
   * Gets all positions owned by a wallet in a specific pool
   * @param poolAddress The whirlpool address
   * @param walletAddress The wallet public key
   * @returns Array of PositionInfo
   */
  async getPositionsInPool(poolAddress: string, walletAddress: PublicKey): Promise<PositionInfo[]> {
    try {
      logger.info(`Getting positions for pool ${poolAddress} and wallet ${walletAddress.toBase58()}`);

      // Get all token accounts owned by the wallet
      const tokenAccounts = await this.solana.connection.getParsedTokenAccountsByOwner(walletAddress, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // SPL Token program
      });

      const positions: PositionInfo[] = [];

      // For each token account, check if it's a position NFT (amount = 1, decimals = 0)
      for (const { account } of tokenAccounts.value) {
        const parsedInfo = account.data.parsed?.info;
        if (!parsedInfo) continue;

        const tokenAmount = parsedInfo.tokenAmount;

        // Position NFTs have exactly 1 token with 0 decimals
        if (tokenAmount.decimals === 0 && tokenAmount.uiAmount === 1) {
          const mintAddress = parsedInfo.mint;

          try {
            // Try to fetch position data
            const positionInfo = await this.getPositionInfo(mintAddress, walletAddress);

            // Check if this position belongs to the specified pool
            if (positionInfo && positionInfo.poolAddress.toLowerCase() === poolAddress.toLowerCase()) {
              positions.push(positionInfo);
            }
          } catch (error) {
            // Not a valid position NFT, skip
            logger.debug(`Skipping non-position NFT: ${mintAddress}`);
          }
        }
      }

      logger.info(`Found ${positions.length} positions in pool ${poolAddress}`);
      return positions;
    } catch (error) {
      logger.error('Error getting positions in pool:', error);
      return [];
    }
  }

  /**
   * Gets position information for a specific position NFT
   * @param positionAddress The position NFT mint address
   * @param walletAddress The wallet that owns the position
   * @returns PositionInfo or null if not found
   */
  async getPositionInfo(positionAddress: string, _walletAddress: PublicKey): Promise<PositionInfo | null> {
    try {
      const rpc = this.solana.solanaKitRpc;
      const positionMint = positionAddress as Address;

      // Fetch position account
      const position = await fetchPosition(rpc, positionMint);

      if (!position.data) {
        logger.error(`Position not found: ${positionAddress}`);
        return null;
      }

      const pos = position.data;
      const poolAddress = pos.whirlpool.toString();

      // Get pool info to calculate prices
      const poolInfo = await this.getPoolInfo(poolAddress);
      if (!poolInfo) {
        throw new Error(`Pool not found for position: ${poolAddress}`);
      }

      // Calculate prices from tick indices
      // Price = 1.0001^tick
      const lowerPrice = Math.pow(1.0001, pos.tickLowerIndex);
      const upperPrice = Math.pow(1.0001, pos.tickUpperIndex);

      // TODO: Calculate actual token amounts from liquidity
      // For now, use placeholder values
      const baseTokenAmount = 0;
      const quoteTokenAmount = 0;

      // Fees owed
      const baseFeeAmount = Number(pos.feeOwedA) / 1e9; // Assuming 9 decimals
      const quoteFeeAmount = Number(pos.feeOwedB) / 1e9;

      return {
        address: positionAddress,
        poolAddress,
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        baseTokenAmount,
        quoteTokenAmount,
        baseFeeAmount,
        quoteFeeAmount,
        lowerBinId: pos.tickLowerIndex,
        upperBinId: pos.tickUpperIndex,
        lowerPrice,
        upperPrice,
        price: poolInfo.price,
      };
    } catch (error) {
      logger.error('Error getting position info:', error);
      return null;
    }
  }

  /**
   * Helper to find default pool for a token pair
   * Not used in Orca as pools are discovered via API
   */
  async findDefaultPool(_baseToken: string, _quoteToken: string): Promise<string | null> {
    return null;
  }
}

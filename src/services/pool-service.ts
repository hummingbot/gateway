import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import * as fse from 'fs-extra';

import { connectorsConfig } from '../config/routes/getConnectors';
import { rootPath } from '../paths';
import { Pool, PoolFileFormat, getSupportedConnectors, isSupportedConnector } from '../pools/types';
import { SupportedChain } from '../tokens/types';

import { logger } from './logger';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

export class PoolService {
  private static instance: PoolService;

  private constructor() {}

  public static getInstance(): PoolService {
    if (!PoolService.instance) {
      PoolService.instance = new PoolService();
    }
    return PoolService.instance;
  }

  /**
   * Get the path to a pool list file with security validation
   */
  private getPoolListPath(connector: string): string {
    // Validate inputs to prevent path traversal
    if (!connector) {
      throw new Error('Connector parameter is required');
    }

    // Remove any path traversal attempts
    const sanitizedConnector = path.basename(connector);

    // Additional validation - only allow alphanumeric, dash, and underscore
    const validPathRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validPathRegex.test(sanitizedConnector)) {
      throw new Error(`Invalid connector name: ${connector}`);
    }

    // Construct the path - now using flat structure
    const poolListPath = path.join(rootPath(), 'conf', 'pools', `${sanitizedConnector}.json`);

    // Ensure the resolved path is within the expected directory
    const expectedRoot = path.join(rootPath(), 'conf', 'pools');
    const resolvedPath = path.resolve(poolListPath);
    if (!resolvedPath.startsWith(path.resolve(expectedRoot))) {
      throw new Error('Invalid path: attempted directory traversal');
    }

    return resolvedPath;
  }

  /**
   * Get the template path for initial pool data
   */
  private getTemplatePath(connector: string): string {
    const sanitizedConnector = path.basename(connector);

    return path.join(rootPath(), 'dist', 'src', 'templates', 'pools', `${sanitizedConnector}.json`);
  }

  /**
   * Validate connector
   */
  private async validateConnector(connector: string): Promise<void> {
    if (!isSupportedConnector(connector)) {
      throw new Error(
        `Unsupported connector: ${connector}. Supported connectors: ${getSupportedConnectors().join(', ')}`,
      );
    }
  }

  /**
   * Get chain for a connector by looking it up in the connectors configuration
   */
  private getChainForConnector(connector: string): SupportedChain {
    // Find the connector configuration
    const connectorInfo = connectorsConfig.find((c) => c.name === connector);

    if (!connectorInfo) {
      throw new Error(
        `Unknown connector: ${connector}. Available connectors: ${connectorsConfig.map((c) => c.name).join(', ')}`,
      );
    }

    // Map chain string to SupportedChain enum
    switch (connectorInfo.chain.toLowerCase()) {
      case 'ethereum':
        return SupportedChain.ETHEREUM;
      case 'solana':
        return SupportedChain.SOLANA;
      default:
        throw new Error(`Unsupported chain '${connectorInfo.chain}' for connector: ${connector}`);
    }
  }

  /**
   * Initialize pool list from template if it doesn't exist
   */
  private async initializePoolList(connector: string): Promise<Pool[]> {
    const templatePath = this.getTemplatePath(connector);

    // If template exists, use it
    if (fs.existsSync(templatePath)) {
      try {
        const data = await readFile(templatePath, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        logger.warn(`Failed to read template for ${connector}: ${error.message}`);
      }
    }

    // Return empty array if no template
    return [];
  }

  /**
   * Load pool list from file
   */
  public async loadPoolList(connector: string): Promise<Pool[]> {
    await this.validateConnector(connector);

    const poolListPath = this.getPoolListPath(connector);

    if (!fs.existsSync(poolListPath)) {
      // Initialize from template if available
      const initialPools = await this.initializePoolList(connector);
      if (initialPools.length > 0) {
        await this.savePoolList(connector, initialPools);
        return initialPools;
      }
      return [];
    }

    try {
      const data = await readFile(poolListPath, 'utf8');
      const pools: PoolFileFormat = JSON.parse(data);

      if (!Array.isArray(pools)) {
        throw new Error(`Invalid pool list format: expected array`);
      }

      return pools;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in pool list file: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Save pool list to file with atomic write
   */
  public async savePoolList(connector: string, pools: Pool[]): Promise<void> {
    await this.validateConnector(connector);

    const poolListPath = this.getPoolListPath(connector);
    const dirPath = path.dirname(poolListPath);

    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      await fse.ensureDir(dirPath);
    }

    // Use atomic write (write to temp file then rename)
    const tempPath = `${poolListPath}.tmp`;

    try {
      await writeFile(tempPath, JSON.stringify(pools, null, 2));
      fs.renameSync(tempPath, poolListPath);
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw new Error(`Failed to save pool list: ${error.message}`);
    }
  }

  /**
   * List all pools for a connector with optional filtering
   */
  public async listPools(connector: string, network?: string, type?: 'amm' | 'clmm', search?: string): Promise<Pool[]> {
    const pools = await this.loadPoolList(connector);

    let filteredPools = pools;

    // Filter by network if specified
    if (network) {
      filteredPools = filteredPools.filter((pool) => pool.network === network);
    }

    // Filter by type if specified
    if (type) {
      filteredPools = filteredPools.filter((pool) => pool.type === type);
    }

    // Filter by search term if provided
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPools = filteredPools.filter(
        (pool) =>
          pool.baseSymbol.toLowerCase().includes(searchLower) ||
          pool.quoteSymbol.toLowerCase().includes(searchLower) ||
          pool.address.toLowerCase().includes(searchLower),
      );
    }

    return filteredPools;
  }

  /**
   * Get a specific pool by token pair
   */
  public async getPool(
    connector: string,
    network: string,
    type: 'amm' | 'clmm',
    baseSymbol: string,
    quoteSymbol: string,
  ): Promise<Pool | null> {
    const pools = await this.listPools(connector, network, type);

    // Find by exact match or reversed match
    const pool = pools.find(
      (p) =>
        (p.baseSymbol === baseSymbol && p.quoteSymbol === quoteSymbol) ||
        (p.baseSymbol === quoteSymbol && p.quoteSymbol === baseSymbol),
    );

    return pool || null;
  }

  /**
   * Validate pool data
   */
  public async validatePool(connector: string, pool: Pool): Promise<void> {
    // Validate required fields
    if (!pool.baseSymbol || pool.baseSymbol.trim() === '') {
      throw new Error('Base token symbol is required');
    }

    if (!pool.quoteSymbol || pool.quoteSymbol.trim() === '') {
      throw new Error('Quote token symbol is required');
    }

    if (!pool.address || pool.address.trim() === '') {
      throw new Error('Pool address is required');
    }

    if (!pool.type || !['amm', 'clmm'].includes(pool.type)) {
      throw new Error('Pool type must be either "amm" or "clmm"');
    }

    if (!pool.network || pool.network.trim() === '') {
      throw new Error('Network is required');
    }

    // Validate token addresses
    if (!pool.baseTokenAddress || pool.baseTokenAddress.trim() === '') {
      throw new Error('Base token address is required');
    }

    if (!pool.quoteTokenAddress || pool.quoteTokenAddress.trim() === '') {
      throw new Error('Quote token address is required');
    }

    // Validate fee percentage
    if (pool.feePct === undefined || pool.feePct === null) {
      throw new Error('Fee percentage is required');
    }

    if (pool.feePct < 0 || pool.feePct > 100) {
      throw new Error('Fee percentage must be between 0 and 100');
    }

    // Validate address format based on chain
    const chain = this.getChainForConnector(connector);

    if (chain === SupportedChain.SOLANA) {
      // Validate Solana addresses
      try {
        new PublicKey(pool.address);
        new PublicKey(pool.baseTokenAddress);
        new PublicKey(pool.quoteTokenAddress);
      } catch {
        throw new Error('Invalid Solana address');
      }
    } else if (chain === SupportedChain.ETHEREUM) {
      // Validate Ethereum addresses
      if (!ethers.utils.isAddress(pool.address)) {
        throw new Error('Invalid Ethereum pool address');
      }
      if (!ethers.utils.isAddress(pool.baseTokenAddress)) {
        throw new Error('Invalid Ethereum base token address');
      }
      if (!ethers.utils.isAddress(pool.quoteTokenAddress)) {
        throw new Error('Invalid Ethereum quote token address');
      }
    }

    // Validate that base and quote tokens are different
    if (pool.baseTokenAddress.toLowerCase() === pool.quoteTokenAddress.toLowerCase()) {
      throw new Error('Base and quote tokens must be different');
    }
  }

  /**
   * Add a new pool
   */
  public async addPool(connector: string, pool: Pool): Promise<void> {
    await this.validatePool(connector, pool);

    const pools = await this.loadPoolList(connector);

    // Check for duplicate address only
    if (pools.some((p) => p.address.toLowerCase() === pool.address.toLowerCase())) {
      throw new Error(`Pool with address ${pool.address} already exists`);
    }

    pools.push(pool);
    await this.savePoolList(connector, pools);
  }

  /**
   * Remove a pool by address
   */
  public async removePool(connector: string, network: string, type: 'amm' | 'clmm', address: string): Promise<void> {
    const pools = await this.loadPoolList(connector);
    const initialLength = pools.length;

    const filteredPools = pools.filter(
      (p) => !(p.address.toLowerCase() === address.toLowerCase() && p.network === network && p.type === type),
    );

    if (filteredPools.length === initialLength) {
      throw new Error(`Pool with address ${address} not found on ${network} ${type}`);
    }

    await this.savePoolList(connector, filteredPools);
  }

  /**
   * Get a pool by address
   */
  public async getPoolByAddress(connector: string, address: string): Promise<Pool | null> {
    const pools = await this.loadPoolList(connector);
    return pools.find((p) => p.address.toLowerCase() === address.toLowerCase()) || null;
  }

  /**
   * Get a pool by metadata (type, network, token addresses)
   * This finds pools with identical token pair but potentially different fee tiers or addresses
   */
  public async getPoolByMetadata(
    connector: string,
    type: 'amm' | 'clmm',
    network: string,
    baseTokenAddress: string,
    quoteTokenAddress: string,
  ): Promise<Pool | null> {
    const pools = await this.loadPoolList(connector);
    return (
      pools.find(
        (p) =>
          p.type === type &&
          p.network === network &&
          p.baseTokenAddress.toLowerCase() === baseTokenAddress.toLowerCase() &&
          p.quoteTokenAddress.toLowerCase() === quoteTokenAddress.toLowerCase(),
      ) || null
    );
  }

  /**
   * Update an existing pool
   */
  public async updatePool(connector: string, pool: Pool): Promise<void> {
    await this.validatePool(connector, pool);

    const pools = await this.loadPoolList(connector);

    // Find the pool to update by matching token pair, network, and type
    const existingIndex = pools.findIndex(
      (p) =>
        p.network === pool.network &&
        p.type === pool.type &&
        ((p.baseSymbol === pool.baseSymbol && p.quoteSymbol === pool.quoteSymbol) ||
          (p.baseSymbol === pool.quoteSymbol && p.quoteSymbol === pool.baseSymbol)),
    );

    if (existingIndex === -1) {
      throw new Error(`Pool for ${pool.baseSymbol}-${pool.quoteSymbol} not found on ${pool.network} ${pool.type}`);
    }

    // Check if the new address is already used by another pool
    const addressConflict = pools.some(
      (p, index) => index !== existingIndex && p.address.toLowerCase() === pool.address.toLowerCase(),
    );

    if (addressConflict) {
      throw new Error(`Pool with address ${pool.address} already exists`);
    }

    // Update the pool
    pools[existingIndex] = pool;
    await this.savePoolList(connector, pools);
  }

  /**
   * Get default pools for a connector in the format expected by connectors
   */
  public async getDefaultPools(
    connector: string,
    network: string,
    type: 'amm' | 'clmm',
  ): Promise<Record<string, string>> {
    try {
      const pools = await this.listPools(connector, network, type);
      const poolMap: Record<string, string> = {};

      for (const pool of pools) {
        const pairKey = `${pool.baseSymbol}-${pool.quoteSymbol}`;
        poolMap[pairKey] = pool.address;
      }

      return poolMap;
    } catch (error) {
      logger.error(`Failed to get default pools: ${error.message}`);
      return {};
    }
  }

  /**
   * Track pools for a specific network by loading from conf/pools and fetching pool info
   * This is a chain-agnostic method that can be used by any chain connector
   *
   * @param network Network to track pools for
   * @param poolCache Cache manager to store pool data
   * @param getPoolInfo Callback to fetch pool info for a specific connector/pool
   * @param isTrackingCallback Optional callback to check if tracking is already in progress
   * @returns Object with successCount and failedCount
   */
  public async trackPools(
    network: string,
    poolCache: any, // CacheManager<PoolData>
    getPoolInfo: (connector: string, poolAddress: string, poolType: 'amm' | 'clmm') => Promise<any>,
    isTrackingCallback?: () => boolean,
  ): Promise<{ successCount: number; failedCount: number }> {
    // Check if tracking is already in progress
    if (isTrackingCallback && isTrackingCallback()) {
      logger.debug('Pool tracking already in progress, skipping');
      return { successCount: 0, failedCount: 0 };
    }

    const poolsDir = path.join(rootPath(), 'conf', 'pools');
    const exists = await fse.pathExists(poolsDir);
    if (!exists) {
      logger.info('No pools directory found, skipping pool tracking');
      return { successCount: 0, failedCount: 0 };
    }

    const files = await fse.readdir(poolsDir);
    const poolFiles = files.filter((file) => file.endsWith('.json'));

    if (poolFiles.length === 0) {
      logger.info('No pool files found, skipping pool tracking');
      return { successCount: 0, failedCount: 0 };
    }

    logger.info(`Loading pools from ${poolFiles.length} connector(s)...`);
    let successCount = 0;
    let failedCount = 0;

    // Collect all pools to fetch
    const poolsToFetch: Array<{ connector: string; pool: Pool }> = [];

    for (const file of poolFiles) {
      try {
        const connector = file.replace('.json', '');
        const poolsData = await this.loadPoolList(connector);

        // Filter pools for this network
        const networkPools = poolsData.filter((pool) => pool.network === network);
        poolsToFetch.push(...networkPools.map((pool) => ({ connector, pool })));
      } catch (error: any) {
        logger.warn(`Failed to read pools from ${file}: ${error.message}`);
      }
    }

    if (poolsToFetch.length === 0) {
      logger.info('🏊 No pools to track for this network');
      return { successCount: 0, failedCount: 0 };
    }

    // Use rate limiter to fetch pools (2 concurrent, 500ms delay between requests)
    const { RateLimiter } = await import('./rate-limiter');
    const limiter = new RateLimiter({
      maxConcurrent: 2,
      minDelay: 500,
      name: 'pool-loader',
    });

    logger.info(`Fetching ${poolsToFetch.length} pool(s) with rate limiting...`);

    for (const { connector, pool } of poolsToFetch) {
      await limiter.execute(async () => {
        try {
          // Fetch pool info via callback
          const poolInfo = await getPoolInfo(connector, pool.address, pool.type);

          if (poolInfo) {
            // Store using only pool address as key (no connector prefix needed)
            poolCache.set(pool.address, { poolInfo, poolType: pool.type });
            successCount++;
            logger.debug(`[pool-cache] Loaded ${pool.address}`);
          } else {
            logger.warn(`Failed to fetch pool info for ${pool.address}`);
            failedCount++;
          }
        } catch (error: any) {
          logger.warn(`Failed to fetch pool ${pool.address} from ${connector}: ${error.message}`);
          failedCount++;
        }
      });
    }

    logger.info(`🏊 Loaded ${successCount} pool(s) into cache${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
    return { successCount, failedCount };
  }

  /**
   * Refresh a single pool's data in the background
   * This is a chain-agnostic method that can be used by any chain connector
   *
   * @param poolAddress Pool address (cache key)
   * @param poolCache Cache manager to store pool data
   * @param getPoolInfo Callback to fetch pool info for a specific pool
   */
  public async refreshPool(
    poolAddress: string,
    poolCache: any, // CacheManager<PoolData>
    getPoolInfo: (poolAddress: string, poolType?: 'amm' | 'clmm') => Promise<any>,
  ): Promise<void> {
    try {
      // Get existing pool type from cache if available
      const cached = poolCache.get(poolAddress);
      const poolType = cached?.poolType;

      // Fetch fresh pool info
      const poolInfo = await getPoolInfo(poolAddress, poolType);

      if (poolInfo) {
        // Preserve poolType from original cache entry
        poolCache.set(poolAddress, { poolInfo, poolType });
        logger.debug(`Background pool refresh completed for ${poolAddress}`);
      }
    } catch (error: any) {
      logger.warn(`Background pool refresh failed for ${poolAddress}: ${error.message}`);
    }
  }
}

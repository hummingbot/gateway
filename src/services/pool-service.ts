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
   * Strips geckoData before saving (only saves core pool template data)
   */
  public async savePoolList(connector: string, pools: Pool[]): Promise<void> {
    await this.validateConnector(connector);

    const poolListPath = this.getPoolListPath(connector);
    const dirPath = path.dirname(poolListPath);

    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      await fse.ensureDir(dirPath);
    }

    // Save pools with geckoData included (similar to token storage)
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
    // Validate optional symbol fields (warn if empty but don't fail)
    if (pool.baseSymbol && pool.baseSymbol.trim() === '') {
      logger.warn('Base token symbol is empty string');
    }

    if (pool.quoteSymbol && pool.quoteSymbol.trim() === '') {
      logger.warn('Quote token symbol is empty string');
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
   * Update an existing pool by address
   */
  public async updatePoolByAddress(connector: string, pool: Pool): Promise<void> {
    await this.validatePool(connector, pool);

    const pools = await this.loadPoolList(connector);

    // Find the pool to update by address
    const existingIndex = pools.findIndex((p) => p.address.toLowerCase() === pool.address.toLowerCase());

    if (existingIndex === -1) {
      throw new Error(`Pool with address ${pool.address} not found`);
    }

    // Update the pool
    pools[existingIndex] = pool;
    await this.savePoolList(connector, pools);
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
}

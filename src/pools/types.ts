/**
 * Pool types and interfaces
 */

import { connectorsConfig } from '../config/routes/getConnectors';

export interface PoolTemplate {
  connector: string; // 'raydium', 'uniswap', 'orca', etc.
  type: 'amm' | 'clmm';
  network: string;
  baseSymbol: string; // Required - resolved from token service or CoinGecko
  quoteSymbol: string; // Required - resolved from token service or CoinGecko
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  address: string;
}

export type Pool = PoolTemplate;

export type PoolFileFormat = Pool[];

/**
 * Get list of supported connectors dynamically from connectorsConfig
 * This ensures the list is always up-to-date with available connectors
 */
export function getSupportedConnectors(): string[] {
  return connectorsConfig.map((c) => c.name);
}

/**
 * Check if a connector is supported by checking against the dynamic connectors config
 */
export function isSupportedConnector(connector: string): boolean {
  return connectorsConfig.some((c) => c.name === connector);
}

export interface PoolListRequest {
  chain: string;
  network: string;
  connector?: string; // Optional filter by connector
  type?: 'amm' | 'clmm';
  search?: string;
}

export interface PoolAddRequest {
  chain: string;
  connector: string;
  type: 'amm' | 'clmm';
  network: string;
  address: string;
  baseSymbol: string; // Required
  quoteSymbol: string; // Required
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct?: number;
}

/**
 * Connector Registry - Central registry for all DEX connectors
 *
 * This is the SINGLE place to add new connectors. When adding a new connector:
 * 1. Import the connector class below
 * 2. Add it to SOLANA_CONNECTORS or ETHEREUM_CONNECTORS map
 * 3. Done! All pool fetching code will automatically work.
 *
 * No need to update pool-info-helpers.ts, solana.ts trackPools, or any other files.
 */

import { connectorsConfig } from '../config/routes/getConnectors';

// Import Solana connectors
import { Meteora } from './meteora/meteora';
import { Pancakeswap } from './pancakeswap/pancakeswap';
import { PancakeswapSol } from './pancakeswap-sol/pancakeswap-sol';
import { Raydium } from './raydium/raydium';

// Import Ethereum connectors
import { Uniswap } from './uniswap/uniswap';

/**
 * Registry of Solana connector classes
 * Key: connector name (as it appears in connectorsConfig)
 * Value: connector class with getInstance() method
 */
export const SOLANA_CONNECTORS = {
  meteora: Meteora,
  raydium: Raydium,
  'pancakeswap-sol': PancakeswapSol,
} as const;

/**
 * Registry of Ethereum connector classes
 * Key: connector name (as it appears in connectorsConfig)
 * Value: connector class with getInstance() method
 */
export const ETHEREUM_CONNECTORS = {
  uniswap: Uniswap,
  pancakeswap: Pancakeswap,
} as const;

/**
 * Get chain type for a connector from config
 */
export function getConnectorChain(connector: string): 'solana' | 'ethereum' | null {
  const config = connectorsConfig.find((c) => c.name === connector);
  if (!config) {
    return null;
  }
  return config.chain as 'solana' | 'ethereum';
}

/**
 * Get Solana connector instance
 */
export async function getSolanaConnector(connector: string, network: string): Promise<any> {
  const ConnectorClass = SOLANA_CONNECTORS[connector];
  if (!ConnectorClass) {
    throw new Error(`Unknown Solana connector: ${connector}`);
  }
  return await ConnectorClass.getInstance(network);
}

/**
 * Get Ethereum connector instance
 */
export async function getEthereumConnector(connector: string, network: string): Promise<any> {
  const ConnectorClass = ETHEREUM_CONNECTORS[connector];
  if (!ConnectorClass) {
    throw new Error(`Unknown Ethereum connector: ${connector}`);
  }
  return await ConnectorClass.getInstance(network);
}

/**
 * Fetch pool info from Solana connector
 * Handles different method names (getPoolInfo, getClmmPoolInfo, getAmmPoolInfo)
 */
export async function fetchSolanaPoolInfo(
  connector: string,
  network: string,
  poolAddress: string,
  poolType: 'amm' | 'clmm',
): Promise<any> {
  const instance = await getSolanaConnector(connector, network);

  if (poolType === 'clmm') {
    // Try CLMM-specific method first, fall back to generic getPoolInfo
    if (instance.getClmmPoolInfo) {
      return await instance.getClmmPoolInfo(poolAddress);
    } else if (instance.getPoolInfo) {
      return await instance.getPoolInfo(poolAddress);
    }
    throw new Error(`Connector ${connector} does not support CLMM pool info`);
  } else if (poolType === 'amm') {
    if (instance.getAmmPoolInfo) {
      return await instance.getAmmPoolInfo(poolAddress);
    }
    throw new Error(`Connector ${connector} does not support AMM pool info`);
  }

  throw new Error(`Invalid pool type: ${poolType}`);
}

/**
 * Fetch pool info from Ethereum connector
 * Uses the connector's utils module (getV2PoolInfo, getV3PoolInfo)
 */
export async function fetchEthereumPoolInfo(
  connector: string,
  network: string,
  poolAddress: string,
  poolType: 'amm' | 'clmm',
): Promise<any> {
  // Ethereum connectors use utils pattern
  const { getV2PoolInfo, getV3PoolInfo } = await import(`./${connector}/${connector}.utils`);

  if (poolType === 'clmm') {
    return await getV3PoolInfo(poolAddress, network);
  } else {
    return await getV2PoolInfo(poolAddress, network);
  }
}

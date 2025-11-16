/**
 * Helper functions for fetching pool info from connectors
 */

import { FastifyInstance } from 'fastify';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { connectorsConfig } from '../config/routes/getConnectors';
import { PoolInfo as AmmPoolInfo } from '../schemas/amm-schema';
import { PoolInfo as ClmmPoolInfo } from '../schemas/clmm-schema';
import { logger } from '../services/logger';

interface PoolInfoResult {
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
}

/**
 * Get chain type for a connector from config
 */
function getConnectorChain(connector: string): 'solana' | 'ethereum' | null {
  const config = connectorsConfig.find((c) => c.name === connector);
  if (!config) {
    return null;
  }
  return config.chain as 'solana' | 'ethereum';
}

/**
 * Fetch pool info from the appropriate connector
 */
export async function fetchPoolInfo(
  connector: string,
  type: 'amm' | 'clmm',
  network: string,
  poolAddress: string,
): Promise<PoolInfoResult | null> {
  try {
    const chain = getConnectorChain(connector);

    if (!chain) {
      logger.error(`Unsupported connector: ${connector}`);
      return null;
    }

    let poolInfo;

    if (chain === 'solana') {
      // Import and get Solana connector instance
      const connectorModule = await import(`../connectors/${connector}/${connector}`);
      const ConnectorClass = Object.values(connectorModule).find(
        (exp: any) => exp.getInstance && typeof exp.getInstance === 'function',
      ) as any;

      if (!ConnectorClass) {
        throw new Error(`Connector class not found for: ${connector}`);
      }

      const instance = await ConnectorClass.getInstance(network);

      // Call appropriate method based on pool type
      if (type === 'clmm') {
        if (instance.getClmmPoolInfo) {
          poolInfo = await instance.getClmmPoolInfo(poolAddress);
        } else if (instance.getPoolInfo) {
          poolInfo = await instance.getPoolInfo(poolAddress);
        } else {
          throw new Error(`Connector ${connector} does not support CLMM pool info`);
        }
      } else if (type === 'amm') {
        if (instance.getAmmPoolInfo) {
          poolInfo = await instance.getAmmPoolInfo(poolAddress);
        } else {
          throw new Error(`Connector ${connector} does not support AMM pool info`);
        }
      }
    } else if (chain === 'ethereum') {
      // Ethereum connectors use utils pattern
      const { getV2PoolInfo, getV3PoolInfo } = await import(`../connectors/${connector}/${connector}.utils`);

      if (type === 'clmm') {
        poolInfo = await getV3PoolInfo(poolAddress, network);
      } else {
        poolInfo = await getV2PoolInfo(poolAddress, network);
      }

      // For Ethereum, need to fetch fee separately
      if (poolInfo) {
        const ethereum = await Ethereum.getInstance(network);
        const { Contract } = await import('@ethersproject/contracts');

        let feePct: number;

        if (type === 'clmm') {
          // V3 pools have fee() method
          const v3PoolABI = [
            {
              inputs: [],
              name: 'fee',
              outputs: [{ internalType: 'uint24', name: '', type: 'uint24' }],
              stateMutability: 'view',
              type: 'function',
            },
          ];

          const poolContract = new Contract(poolAddress, v3PoolABI, ethereum.provider);
          const fee = await poolContract.fee();
          feePct = fee / 10000; // Convert from basis points to percentage
        } else {
          // V2 pools - get fee from factory contract
          const v2PairABI = [
            {
              inputs: [],
              name: 'factory',
              outputs: [{ internalType: 'address', name: '', type: 'address' }],
              stateMutability: 'view',
              type: 'function',
            },
          ];

          const v2FactoryABI = [
            {
              inputs: [],
              name: 'feeTo',
              outputs: [{ internalType: 'address', name: '', type: 'address' }],
              stateMutability: 'view',
              type: 'function',
            },
          ];

          const pairContract = new Contract(poolAddress, v2PairABI, ethereum.provider);
          const factoryAddress = await pairContract.factory();
          const factoryContract = new Contract(factoryAddress, v2FactoryABI, ethereum.provider);

          // V2 pairs typically have 0.3% fee (30 basis points)
          // PancakeSwap V2 has 0.25% fee (25 basis points)
          // Since the fee isn't exposed on-chain for V2, we use the standard for each DEX
          feePct = connector === 'pancakeswap' ? 0.25 : 0.3;
        }

        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: feePct,
        };
      }
    } else {
      logger.error(`Unsupported chain: ${chain} for connector: ${connector}`);
      return null;
    }

    if (!poolInfo) {
      return null;
    }

    return {
      baseTokenAddress: poolInfo.baseTokenAddress,
      quoteTokenAddress: poolInfo.quoteTokenAddress,
      feePct: poolInfo.feePct,
    };
  } catch (error) {
    logger.error(`Error fetching pool info for ${poolAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Resolve token addresses to symbols using chain's token registry
 * Falls back to fetching token info from blockchain if not in token list
 */
export async function resolveTokenSymbols(
  connector: string,
  network: string,
  baseTokenAddress: string,
  quoteTokenAddress: string,
): Promise<{ baseSymbol?: string; quoteSymbol?: string }> {
  try {
    // Get chain type from connector registry
    const chainType = getConnectorChain(connector);

    if (!chainType) {
      throw new Error(`Unsupported connector: ${connector}`);
    }

    // Get chain instance and tokens from local list only
    const chain = chainType === 'solana' ? await Solana.getInstance(network) : await Ethereum.getInstance(network);

    // Use local token list only - don't fetch from blockchain
    const baseToken = await chain.getToken(baseTokenAddress);
    const quoteToken = await chain.getToken(quoteTokenAddress);

    return {
      baseSymbol: baseToken?.symbol,
      quoteSymbol: quoteToken?.symbol,
    };
  } catch (error) {
    logger.error(`Error resolving token symbols: ${error.message}`);
    // Return empty symbols instead of throwing
    return {
      baseSymbol: undefined,
      quoteSymbol: undefined,
    };
  }
}

/**
 * Helper functions for fetching pool info from connectors
 */

import { FastifyInstance } from 'fastify';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { fetchEthereumPoolInfo, fetchSolanaPoolInfo, getConnectorChain } from '../connectors/connector-registry';
import { PoolInfo as AmmPoolInfo } from '../schemas/amm-schema';
import { PoolInfo as ClmmPoolInfo } from '../schemas/clmm-schema';
import { logger } from '../services/logger';

interface PoolInfoResult {
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
}

/**
 * Fetch pool info from the appropriate connector using the central registry
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
      poolInfo = await fetchSolanaPoolInfo(connector, network, poolAddress, type);
    } else if (chain === 'ethereum') {
      poolInfo = await fetchEthereumPoolInfo(connector, network, poolAddress, type);

      // For Ethereum, need to fetch fee separately for CLMM pools
      if (type === 'clmm' && poolInfo) {
        const ethereum = await Ethereum.getInstance(network);
        const { Contract } = await import('@ethersproject/contracts');
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
        const feePct = fee / 10000; // Convert from basis points to percentage

        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: feePct,
        };
      } else if (type === 'amm' && poolInfo) {
        // Default V2 fee - can be overridden per connector if needed
        let feePct = 0.3; // Uniswap V2 default
        if (connector === 'pancakeswap' && network === 'mainnet') {
          feePct = 0.25; // PancakeSwap V2 on BSC
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
): Promise<{ baseSymbol: string; quoteSymbol: string }> {
  try {
    // Get chain type from connector registry
    const chainType = getConnectorChain(connector);

    if (!chainType) {
      throw new Error(`Unsupported connector: ${connector}`);
    }

    // Get chain instance based on type
    let chain: Solana | Ethereum;
    if (chainType === 'solana') {
      chain = await Solana.getInstance(network);
    } else if (chainType === 'ethereum') {
      chain = await Ethereum.getInstance(network);
    } else {
      throw new Error(`Unsupported chain type: ${chainType}`);
    }

    // Get token info - use getOrFetchToken for Ethereum to fetch from blockchain if not in list
    let baseToken;
    let quoteToken;

    if (chain instanceof Ethereum) {
      baseToken = await chain.getOrFetchToken(baseTokenAddress);
      quoteToken = await chain.getOrFetchToken(quoteTokenAddress);
    } else {
      baseToken = chain.getToken(baseTokenAddress);
      quoteToken = chain.getToken(quoteTokenAddress);
    }

    if (!baseToken || !quoteToken) {
      throw new Error(`Token not found: ${!baseToken ? baseTokenAddress : ''} ${!quoteToken ? quoteTokenAddress : ''}`);
    }

    return {
      baseSymbol: baseToken.symbol,
      quoteSymbol: quoteToken.symbol,
    };
  } catch (error) {
    logger.error(`Error resolving token symbols: ${error.message}`);
    throw error;
  }
}

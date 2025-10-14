/**
 * Helper functions for fetching pool info from connectors
 */

import { FastifyInstance } from 'fastify';

import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { Meteora } from '../connectors/meteora/meteora';
import { Raydium } from '../connectors/raydium/raydium';
import { Uniswap } from '../connectors/uniswap/uniswap';
import { PoolInfo as AmmPoolInfo } from '../schemas/amm-schema';
import { PoolInfo as ClmmPoolInfo } from '../schemas/clmm-schema';
import { logger } from '../services/logger';

interface PoolInfoResult {
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
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
    if (connector === 'raydium') {
      const raydium = await Raydium.getInstance(network);

      if (type === 'clmm') {
        const poolInfo = await raydium.getClmmPoolInfo(poolAddress);
        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: poolInfo.feePct,
        };
      } else {
        const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: poolInfo.feePct,
        };
      }
    } else if (connector === 'meteora') {
      const meteora = await Meteora.getInstance(network);
      const poolInfo = await meteora.getPoolInfo(poolAddress);
      return {
        baseTokenAddress: poolInfo.baseTokenAddress,
        quoteTokenAddress: poolInfo.quoteTokenAddress,
        feePct: poolInfo.feePct,
      };
    } else if (connector === 'uniswap') {
      const ethereum = await Ethereum.getInstance(network);
      const { getV2PoolInfo, getV3PoolInfo } = await import('../connectors/uniswap/uniswap.utils');

      if (type === 'clmm') {
        // For CLMM (V3)
        const poolInfo = await getV3PoolInfo(poolAddress, network);
        if (!poolInfo) {
          return null;
        }

        // Get fee from pool contract
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
      } else {
        // For AMM (V2)
        const poolInfo = await getV2PoolInfo(poolAddress, network);
        if (!poolInfo) {
          return null;
        }

        // Uniswap V2 has fixed 0.3% fee
        return {
          baseTokenAddress: poolInfo.baseTokenAddress,
          quoteTokenAddress: poolInfo.quoteTokenAddress,
          feePct: 0.3,
        };
      }
    }

    logger.error(`Unsupported connector: ${connector}`);
    return null;
  } catch (error) {
    logger.error(`Error fetching pool info for ${poolAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Resolve token addresses to symbols using chain's token registry
 */
export async function resolveTokenSymbols(
  connector: string,
  network: string,
  baseTokenAddress: string,
  quoteTokenAddress: string,
): Promise<{ baseSymbol: string; quoteSymbol: string }> {
  try {
    // Determine chain based on connector
    let chain: Solana | Ethereum;

    if (connector === 'raydium' || connector === 'meteora') {
      chain = await Solana.getInstance(network);
    } else if (connector === 'uniswap') {
      chain = await Ethereum.getInstance(network);
    } else {
      throw new Error(`Unsupported connector: ${connector}`);
    }

    // Get token info
    const baseToken = await chain.getToken(baseTokenAddress);
    const quoteToken = await chain.getToken(quoteTokenAddress);

    return {
      baseSymbol: baseToken.symbol,
      quoteSymbol: quoteToken.symbol,
    };
  } catch (error) {
    logger.error(`Error resolving token symbols: ${error.message}`);
    throw error;
  }
}

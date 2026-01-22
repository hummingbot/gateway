// ETCswap SDK imports - Using unified ETCswap SDKs for type consistency
import { Pair as V2Pair } from '@etcswapv2/sdk';
import { Token } from '@etcswapv2/sdk-core';
import { FeeAmount, Pool as V3Pool } from '@etcswapv3/sdk';
import { Contract } from '@ethersproject/contracts';
import { Token as UniswapToken } from '@uniswap/sdk-core';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { Pool as UniswapV3Pool } from '@uniswap/v3-sdk';
// V3 Pool ABI from Uniswap (contracts are ABI-compatible)
import { FastifyInstance } from 'fastify';
import JSBI from 'jsbi';

import { TokenInfo, Ethereum } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import { ETCswap } from './etcswap';
import { ETCswapConfig } from './etcswap.config';
import { IUniswapV2PairABI, isV3Available } from './etcswap.contracts';

/**
 * Check if a string is a valid fraction (in the form of 'a/b')
 * @param value The string to check
 * @returns True if the string is a valid fraction, false otherwise
 */
export function isFractionString(value: string): boolean {
  return value.includes('/') && value.split('/').length === 2;
}

/**
 * Determine if a pool address is a valid ETCswap V2 pool
 * @param poolAddress The pool address to check
 * @returns True if the address is a valid ETCswap V2 pool, false otherwise
 */
export const isValidV2Pool = async (poolAddress: string): Promise<boolean> => {
  try {
    return poolAddress && poolAddress.length === 42 && poolAddress.startsWith('0x');
  } catch (error) {
    logger.error(`Error validating V2 pool: ${error}`);
    return false;
  }
};

/**
 * Determine if a pool address is a valid ETCswap V3 pool
 * @param poolAddress The pool address to check
 * @returns True if the address is a valid ETCswap V3 pool, false otherwise
 */
export const isValidV3Pool = async (poolAddress: string): Promise<boolean> => {
  try {
    return poolAddress && poolAddress.length === 42 && poolAddress.startsWith('0x');
  } catch (error) {
    logger.error(`Error validating V3 pool: ${error}`);
    return false;
  }
};

/**
 * Parse a fee tier string to a FeeAmount enum value
 * @param feeTier The fee tier string ('LOWEST', 'LOW', 'MEDIUM', 'HIGH')
 * @returns The corresponding FeeAmount enum value
 */
export const parseFeeTier = (feeTier: string): FeeAmount => {
  switch (feeTier.toUpperCase()) {
    case 'LOWEST':
      return FeeAmount.LOWEST;
    case 'LOW':
      return FeeAmount.LOW;
    case 'MEDIUM':
      return FeeAmount.MEDIUM;
    case 'HIGH':
      return FeeAmount.HIGH;
    default:
      return FeeAmount.MEDIUM;
  }
};

/**
 * Find the pool address for a token pair in either ETCswap V2 or V3
 * @param baseToken The base token symbol or address
 * @param quoteToken The quote token symbol or address
 * @param poolType 'amm' for ETCswap V2 or 'clmm' for ETCswap V3
 * @param network Network name (e.g., 'classic', 'mordor')
 * @returns The pool address if found, otherwise null
 */
export const findPoolAddress = (
  _baseToken: string,
  _quoteToken: string,
  _poolType: 'amm' | 'clmm',
  _network: string,
): string | null => {
  // Pools are now managed separately, return null for dynamic pool discovery
  return null;
};

/**
 * Format token amounts for display
 * @param amount The raw amount as a string or number
 * @param decimals The token decimals
 * @returns The formatted token amount
 */
export const formatTokenAmount = (amount: string | number, decimals: number): number => {
  try {
    if (typeof amount === 'string') {
      return parseFloat(amount) / Math.pow(10, decimals);
    }
    return amount / Math.pow(10, decimals);
  } catch (error) {
    logger.error(`Error formatting token amount: ${error}`);
    return 0;
  }
};

/**
 * Gets an ETCswap Token from a token symbol
 * This helper function is used by the AMM and CLMM routes
 * @param fastify Fastify instance for error handling
 * @param ethereum Ethereum instance to look up tokens
 * @param etcswap ETCswap instance
 * @param tokenSymbol The token symbol to look up
 * @returns A Uniswap SDK Token object (ETCswap is ABI-compatible)
 */
export async function getFullTokenFromSymbol(
  fastify: FastifyInstance,
  ethereum: Ethereum,
  etcswap: ETCswap,
  tokenSymbol: string,
): Promise<Token> {
  if (!ethereum.ready()) {
    await ethereum.init();
  }

  // Get token from local token list
  const tokenInfo = await ethereum.getToken(tokenSymbol);

  if (!tokenInfo) {
    throw fastify.httpErrors.badRequest(`Token ${tokenSymbol} is not supported`);
  }

  // Convert to Uniswap SDK Token (ETCswap uses the same SDK)
  return etcswap.getETCswapToken(tokenInfo);
}

/**
 * Creates an ETCswap V3 Pool instance with a tick data provider
 * @param tokenA The first token in the pair
 * @param tokenB The second token in the pair
 * @param fee The fee for the pool
 * @param sqrtPriceX96 The square root price as a Q64.96
 * @param liquidity The liquidity of the pool
 * @param tick The current tick of the pool
 * @returns A V3Pool instance with a tick data provider
 */
export function getETCswapV3PoolWithTickProvider(
  tokenA: Token,
  tokenB: Token,
  fee: FeeAmount,
  sqrtPriceX96: string,
  liquidity: string,
  tick: number,
): V3Pool {
  return new V3Pool(
    tokenA,
    tokenB,
    fee,
    sqrtPriceX96,
    liquidity,
    tick,
    // Add a tick data provider to make SDK operations work
    {
      async getTick(index) {
        return {
          index,
          liquidityNet: JSBI.BigInt(0),
          liquidityGross: JSBI.BigInt(0),
        };
      },
      async nextInitializedTickWithinOneWord(tick, lte, tickSpacing) {
        // Always return a valid result to prevent errors
        const nextTick = lte ? tick - tickSpacing : tick + tickSpacing;
        return [nextTick, false];
      },
    },
  );
}

/**
 * Convert an ETCswap V3 Pool to a Uniswap V3 Pool for position management.
 * This is needed because NonfungiblePositionManager expects Uniswap's Pool type.
 * @param etcswapPool The ETCswap V3 Pool to convert
 * @returns A Uniswap V3 Pool with the same data
 */
export function toUniswapPool(etcswapPool: V3Pool): UniswapV3Pool {
  // Convert ETCswap tokens to Uniswap tokens
  const token0 = new UniswapToken(
    etcswapPool.token0.chainId,
    etcswapPool.token0.address,
    etcswapPool.token0.decimals,
    etcswapPool.token0.symbol,
    etcswapPool.token0.name,
  );
  const token1 = new UniswapToken(
    etcswapPool.token1.chainId,
    etcswapPool.token1.address,
    etcswapPool.token1.decimals,
    etcswapPool.token1.symbol,
    etcswapPool.token1.name,
  );

  // Create a Uniswap Pool with the same data
  return new UniswapV3Pool(
    token0,
    token1,
    etcswapPool.fee,
    etcswapPool.sqrtRatioX96.toString(),
    etcswapPool.liquidity.toString(),
    etcswapPool.tickCurrent,
    // Add a tick data provider for SDK operations
    {
      async getTick(index: number) {
        return {
          index,
          liquidityNet: JSBI.BigInt(0),
          liquidityGross: JSBI.BigInt(0),
        };
      },
      async nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number) {
        const nextTick = lte ? tick - tickSpacing : tick + tickSpacing;
        return [nextTick, false] as [number, boolean];
      },
    },
  );
}

/**
 * Pool info interface for ETCswap pools
 */
export interface ETCswapPoolInfo {
  baseTokenAddress: string;
  quoteTokenAddress: string;
  poolType: 'amm' | 'clmm';
}

/**
 * Get pool information for an ETCswap V2 (AMM) pool
 * @param poolAddress The pool address
 * @param network The network name
 * @returns Pool information with base and quote token addresses
 */
export async function getV2PoolInfo(poolAddress: string, network: string): Promise<ETCswapPoolInfo | null> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    // Ensure ETCswap connector is initialized
    await ETCswap.getInstance(network);

    // Create pair contract
    const pairContract = new Contract(poolAddress, IUniswapV2PairABI.abi, ethereum.provider);

    // Get token addresses
    const [token0Address, token1Address] = await Promise.all([pairContract.token0(), pairContract.token1()]);

    // By convention, use token0 as base and token1 as quote
    return {
      baseTokenAddress: token0Address,
      quoteTokenAddress: token1Address,
      poolType: 'amm',
    };
  } catch (error) {
    logger.error(`Error getting V2 pool info: ${error.message}`);
    return null;
  }
}

/**
 * Get pool information for an ETCswap V3 (CLMM) pool
 * @param poolAddress The pool address
 * @param network The network name
 * @returns Pool information with base and quote token addresses
 */
export async function getV3PoolInfo(poolAddress: string, network: string): Promise<ETCswapPoolInfo | null> {
  try {
    // Check if V3 is available on this network
    if (!isV3Available(network)) {
      logger.warn(`V3 not available on network: ${network}`);
      return null;
    }

    const ethereum = await Ethereum.getInstance(network);

    // V3 Pool contract ABI (minimal - just what we need)
    const v3PoolABI = [
      {
        inputs: [],
        name: 'token0',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'token1',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'fee',
        outputs: [{ internalType: 'uint24', name: '', type: 'uint24' }],
        stateMutability: 'view',
        type: 'function',
      },
    ];

    // Create pool contract
    const poolContract = new Contract(poolAddress, v3PoolABI, ethereum.provider);

    // Get token addresses
    const [token0Address, token1Address] = await Promise.all([poolContract.token0(), poolContract.token1()]);

    // By convention, use token0 as base and token1 as quote
    return {
      baseTokenAddress: token0Address,
      quoteTokenAddress: token1Address,
      poolType: 'clmm',
    };
  } catch (error) {
    logger.error(`Error getting V3 pool info: ${error.message}`);
    return null;
  }
}

/**
 * Get pool information for any ETCswap pool (V2 or V3)
 * @param poolAddress The pool address
 * @param network The network name
 * @param poolType Optional pool type hint
 * @returns Pool information with base and quote token addresses
 */
export async function getETCswapPoolInfo(
  poolAddress: string,
  network: string,
  poolType?: 'amm' | 'clmm',
): Promise<ETCswapPoolInfo | null> {
  // If pool type is specified, use the appropriate method
  if (poolType === 'amm') {
    return getV2PoolInfo(poolAddress, network);
  } else if (poolType === 'clmm') {
    return getV3PoolInfo(poolAddress, network);
  }

  // Otherwise, try V2 first, then V3
  const v2Info = await getV2PoolInfo(poolAddress, network);
  if (v2Info) {
    return v2Info;
  }

  return getV3PoolInfo(poolAddress, network);
}

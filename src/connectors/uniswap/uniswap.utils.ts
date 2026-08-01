import { Contract } from '@ethersproject/contracts';
import { Token } from '@uniswap/sdk-core';
import { Pair as V2Pair } from '@uniswap/v2-sdk';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { FeeAmount, Pool as V3Pool, SqrtPriceMath, TickMath } from '@uniswap/v3-sdk';
import { FastifyInstance } from 'fastify';
import JSBI from 'jsbi';

import { TokenInfo, Ethereum } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import { Uniswap } from './uniswap';
import { UniswapConfig } from './uniswap.config';
import { IUniswapV2PairABI } from './uniswap.contracts';

/**
 * Check if a string is a valid fraction (in the form of 'a/b')
 * @param value The string to check
 * @returns True if the string is a valid fraction, false otherwise
 */
export function isFractionString(value: string): boolean {
  return value.includes('/') && value.split('/').length === 2;
}

/**
 * Determine if a pool address is a valid Uniswap V2 pool
 * @param poolAddress The pool address to check
 * @returns True if the address is a valid Uniswap V2 pool, false otherwise
 */
export const isValidV2Pool = async (poolAddress: string): Promise<boolean> => {
  try {
    // This would typically check if the contract at poolAddress conforms to the V2 Pair interface
    // For now, we'll just check if it's a valid address
    return poolAddress && poolAddress.length === 42 && poolAddress.startsWith('0x');
  } catch (error) {
    logger.error(`Error validating V2 pool: ${error}`);
    return false;
  }
};

/**
 * Determine if a pool address is a valid Uniswap V3 pool
 * @param poolAddress The pool address to check
 * @returns True if the address is a valid Uniswap V3 pool, false otherwise
 */
export const isValidV3Pool = async (poolAddress: string): Promise<boolean> => {
  try {
    // This would typically check if the contract at poolAddress conforms to the V3 Pool interface
    // For now, we'll just check if it's a valid address
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
 * Find the pool address for a token pair in either Uniswap V2 or V3
 * @param baseToken The base token symbol or address
 * @param quoteToken The quote token symbol or address
 * @param poolType 'amm' for Uniswap V2 or 'clmm' for Uniswap V3
 * @param network Network name (e.g., 'base', 'mainnet') - now required for pool lookup
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
 * Gets a Uniswap Token from a token symbol
 * This helper function is used by the AMM and CLMM routes
 * @param fastify Fastify instance for error handling
 * @param ethereum Ethereum instance to look up tokens
 * @param tokenSymbol The token symbol to look up
 * @returns A Uniswap SDK Token object
 */
export async function getFullTokenFromSymbol(
  fastify: FastifyInstance,
  ethereum: Ethereum,
  uniswap: Uniswap,
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

  // Convert to Uniswap SDK Token
  return uniswap.getUniswapToken(tokenInfo);
}

/**
 * Creates a Uniswap V3 Pool instance with a tick data provider
 * @param tokenA The first token in the pair
 * @param tokenB The second token in the pair
 * @param fee The fee for the pool
 * @param sqrtPriceX96 The square root price as a Q64.96
 * @param liquidity The liquidity of the pool
 * @param tick The current tick of the pool
 * @returns A V3Pool instance with a tick data provider
 */
export function getUniswapV3PoolWithTickProvider(
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
        // Use the direction parameter (lte) to determine which way to go
        const nextTick = lte ? tick - tickSpacing : tick + tickSpacing;
        return [nextTick, false];
      },
    },
  );
}

/**
 * Pool info interface for Uniswap pools
 */
export interface UniswapPoolInfo {
  baseTokenAddress: string;
  quoteTokenAddress: string;
  poolType: 'amm' | 'clmm';
}

/**
 * Get pool information for a Uniswap V2 (AMM) pool
 * @param poolAddress The pool address
 * @param network The network name
 * @returns Pool information with base and quote token addresses
 */
export async function getV2PoolInfo(poolAddress: string, network: string): Promise<UniswapPoolInfo | null> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    const uniswap = await Uniswap.getInstance(network);

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
 * Get pool information for a Uniswap V3 (CLMM) pool
 * @param poolAddress The pool address
 * @param network The network name
 * @returns Pool information with base and quote token addresses
 */
export async function getV3PoolInfo(poolAddress: string, network: string): Promise<UniswapPoolInfo | null> {
  try {
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
 * Get pool information for any Uniswap pool (V2 or V3)
 * @param poolAddress The pool address
 * @param network The network name
 * @param poolType Optional pool type hint
 * @returns Pool information with base and quote token addresses
 */
export async function getUniswapPoolInfo(
  poolAddress: string,
  network: string,
  poolType?: 'amm' | 'clmm',
): Promise<UniswapPoolInfo | null> {
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

/**
 * Per-bin liquidity distribution around the current tick for a Uniswap V3 pool.
 *
 * Uniswap V3 has no equivalent of Orca's "fetch all positions for pool" RPC —
 * positions are NFTs on the NonfungiblePositionManager. Instead we walk the
 * pool's per-tick liquidity profile directly:
 *
 *   1. Read `liquidityNet` at every bin boundary in the window via parallel
 *      `pool.ticks(tick)` reads (one eth_call each, fired with Promise.all).
 *      Ticks that have never been initialized return zeros — that's harmless.
 *   2. Start with the pool's active L = pool.liquidity() in the bin that
 *      contains the current tick. Propagate L outward by adding/subtracting
 *      `liquidityNet` at each boundary crossed (per the V3 spec).
 *   3. For each bin, convert L → (amount0, amount1) via
 *      SqrtPriceMath.getAmount{0,1}Delta(sqrtA, sqrtB, L, false), splitting
 *      at the pool's current sqrtPriceX96 when the bin straddles the
 *      active tick.
 *   4. Map to base/quote using `isBaseToken0`, scale by decimals.
 *
 * Output shape mirrors Meteora's `pool-info.bins[]`:
 *   { binId, price, baseTokenAmount, quoteTokenAmount }
 */
export interface UniswapBinDistributionEntry {
  binId: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
}

export async function computeUniswapBinDistribution(args: {
  poolContract: Contract;
  tickSpacing: number;
  currentTick: number;
  currentSqrtPriceX96: JSBI;
  activeLiquidity: JSBI;
  decimals0: number;
  decimals1: number;
  isBaseToken0: boolean;
  binCount: number;
}): Promise<UniswapBinDistributionEntry[]> {
  const {
    poolContract,
    tickSpacing,
    currentTick,
    currentSqrtPriceX96,
    activeLiquidity,
    decimals0,
    decimals1,
    isBaseToken0,
    binCount,
  } = args;
  if (binCount <= 0) return [];

  const halfBins = Math.floor(binCount / 2);
  const snapped = Math.floor(currentTick / tickSpacing) * tickSpacing;
  const firstBinStart = snapped - halfBins * tickSpacing;
  const boundaries: number[] = [];
  for (let i = 0; i <= binCount; i++) {
    boundaries.push(firstBinStart + i * tickSpacing);
  }

  // Parallel reads of pool.ticks(tick) at each boundary. Non-initialized
  // ticks return zeros which is the correct neutral element for liquidityNet.
  const tickData = await Promise.all(
    boundaries.map((tick) => poolContract.ticks(tick).catch(() => ({ liquidityNet: 0 }))),
  );

  const curIdx = Math.floor((currentTick - firstBinStart) / tickSpacing);

  // Propagate L outward from the current bin (V3 spec: crossing a tick going
  // UP adds liquidityNet, going DOWN subtracts it).
  const binLs: JSBI[] = new Array(binCount);
  binLs[curIdx] = activeLiquidity;
  for (let i = curIdx + 1; i < binCount; i++) {
    const net = JSBI.BigInt(tickData[i].liquidityNet.toString());
    binLs[i] = JSBI.add(binLs[i - 1], net);
  }
  for (let i = curIdx - 1; i >= 0; i--) {
    const net = JSBI.BigInt(tickData[i + 1].liquidityNet.toString());
    binLs[i] = JSBI.subtract(binLs[i + 1], net);
  }

  const scale0 = Math.pow(10, decimals0);
  const scale1 = Math.pow(10, decimals1);
  const zero = JSBI.BigInt(0);
  const bins: UniswapBinDistributionEntry[] = [];
  for (let i = 0; i < binCount; i++) {
    const tickStart = boundaries[i];
    const tickEnd = boundaries[i + 1];
    const L = binLs[i];
    let amount0: JSBI = zero;
    let amount1: JSBI = zero;
    if (JSBI.greaterThan(L, zero)) {
      const sqrtA = TickMath.getSqrtRatioAtTick(tickStart);
      const sqrtB = TickMath.getSqrtRatioAtTick(tickEnd);
      if (currentTick >= tickEnd) {
        amount1 = SqrtPriceMath.getAmount1Delta(sqrtA, sqrtB, L, false);
      } else if (currentTick < tickStart) {
        amount0 = SqrtPriceMath.getAmount0Delta(sqrtA, sqrtB, L, false);
      } else {
        amount0 = SqrtPriceMath.getAmount0Delta(currentSqrtPriceX96, sqrtB, L, false);
        amount1 = SqrtPriceMath.getAmount1Delta(sqrtA, currentSqrtPriceX96, L, false);
      }
    }
    const amt0 = parseFloat(amount0.toString()) / scale0;
    const amt1 = parseFloat(amount1.toString()) / scale1;
    const baseTokenAmount = isBaseToken0 ? amt0 : amt1;
    const quoteTokenAmount = isBaseToken0 ? amt1 : amt0;

    // Price at tickStart in human units (quote/base regardless of token order).
    const rawT1PerT0 = Math.pow(1.0001, tickStart) * Math.pow(10, decimals0 - decimals1);
    const price = isBaseToken0 ? rawT1PerT0 : 1 / rawT1PerT0;
    bins.push({
      binId: tickStart,
      price,
      baseTokenAmount,
      quoteTokenAmount,
    });
  }
  return bins;
}

import { 
  FeeAmount,
  Pool as V3Pool
} from '@uniswap/v3-sdk';
import { Pair as V2Pair } from '@uniswap/v2-sdk';
import { Token } from '@uniswap/sdk-core';
import { logger } from '../../services/logger';
import { UniswapConfig } from './uniswap.config';

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
 * @returns The pool address if found, otherwise null
 */
export const findPoolAddress = (
  baseToken: string, 
  quoteToken: string, 
  poolType: 'amm' | 'clmm'
): string | null => {
  const poolKey = `${baseToken}-${quoteToken}`;
  const reversePoolKey = `${quoteToken}-${baseToken}`;
  
  try {
    if (poolType === 'amm') {
      // Check AMM (V2) pools
      if (UniswapConfig.config.amm.pools[poolKey]) {
        return UniswapConfig.config.amm.pools[poolKey];
      }
      
      // Check reversed pair name
      if (UniswapConfig.config.amm.pools[reversePoolKey]) {
        return UniswapConfig.config.amm.pools[reversePoolKey];
      }
    } else {
      // For CLMM (V3), we might have different fee tiers
      // Try to find a match with any fee tier
      const allPoolKeys = Object.keys(UniswapConfig.config.clmm.pools);
      
      // Look for exact match first
      for (const key of allPoolKeys) {
        if (key.startsWith(`${baseToken}-${quoteToken}`) || key.startsWith(`${quoteToken}-${baseToken}`)) {
          return UniswapConfig.config.clmm.pools[key];
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.error(`Error finding pool address: ${error}`);
    return null;
  }
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
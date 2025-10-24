/**
 * Raydium AMM Position Info Query
 *
 * Query operation to fetch user's LP position information in an AMM pool.
 * Calculates LP token balance and corresponding base/quote token amounts.
 */

import { PublicKey } from '@solana/web3.js';
import { PositionInfoParams, PositionInfoResult } from '../../types/amm';

/**
 * Calculate LP token amount and corresponding token amounts
 */
async function calculateLpAmount(
  solana: any,
  walletAddress: PublicKey,
  poolInfo: any,
): Promise<{
  lpTokenAmount: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
}> {
  // Get LP mint from poolInfo
  if (!poolInfo.lpMint || !poolInfo.lpMint.address) {
    throw new Error(`Could not find LP mint for pool`);
  }

  const lpMint = poolInfo.lpMint.address;

  // Get user's LP token account
  const lpTokenAccounts = await solana.connection.getTokenAccountsByOwner(walletAddress, {
    mint: new PublicKey(lpMint),
  });

  if (lpTokenAccounts.value.length === 0) {
    // Return zero values if no LP token account exists
    return {
      lpTokenAmount: 0,
      baseTokenAmount: 0,
      quoteTokenAmount: 0,
    };
  }

  // Get LP token balance
  const lpTokenAccount = lpTokenAccounts.value[0].pubkey;
  const accountInfo = await solana.connection.getTokenAccountBalance(lpTokenAccount);
  const lpTokenAmount = accountInfo.value.uiAmount || 0;

  if (lpTokenAmount === 0) {
    return {
      lpTokenAmount: 0,
      baseTokenAmount: 0,
      quoteTokenAmount: 0,
    };
  }

  // Calculate token amounts based on LP share
  const baseTokenAmount = (lpTokenAmount * poolInfo.mintAmountA) / poolInfo.lpAmount;
  const quoteTokenAmount = (lpTokenAmount * poolInfo.mintAmountB) / poolInfo.lpAmount;

  return {
    lpTokenAmount,
    baseTokenAmount: baseTokenAmount || 0,
    quoteTokenAmount: quoteTokenAmount || 0,
  };
}

/**
 * Get AMM Position Information
 *
 * Fetches user's LP position information including:
 * - LP token balance
 * - Base and quote token amounts
 * - Pool address and token addresses
 * - Current price
 *
 * @param raydium - Raydium connector instance
 * @param solana - Solana chain instance
 * @param params - Position info parameters
 * @returns Position information
 */
export async function getPositionInfo(
  raydium: any, // Will be properly typed as RaydiumConnector
  solana: any,  // Solana chain instance
  params: PositionInfoParams,
): Promise<PositionInfoResult> {
  // Validate wallet address
  let walletPublicKey: PublicKey;
  try {
    walletPublicKey = new PublicKey(params.walletAddress);
  } catch (error) {
    throw new Error('Invalid wallet address');
  }

  // Validate pool address
  try {
    new PublicKey(params.poolAddress);
  } catch (error) {
    throw new Error('Invalid pool address');
  }

  // Get pool info
  const ammPoolInfo = await raydium.getAmmPoolInfo(params.poolAddress);
  const [poolInfo, _poolKeys] = await raydium.getPoolfromAPI(params.poolAddress);

  if (!poolInfo) {
    throw new Error('Pool not found');
  }

  // Calculate LP token amount and token amounts
  const { lpTokenAmount, baseTokenAmount, quoteTokenAmount } = await calculateLpAmount(
    solana,
    walletPublicKey,
    poolInfo,
  );

  return {
    poolAddress: params.poolAddress,
    walletAddress: params.walletAddress,
    baseTokenAddress: ammPoolInfo.baseTokenAddress,
    quoteTokenAddress: ammPoolInfo.quoteTokenAddress,
    lpTokenAmount,
    baseTokenAmount,
    quoteTokenAmount,
    price: poolInfo.price,
  };
}

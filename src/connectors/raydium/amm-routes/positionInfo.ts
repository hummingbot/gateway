import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Raydium, RaydiumAmmPool } from '../raydium';

/**
 * The wallet's LP balance and its share of the pool's on-chain reserves
 */
async function calculateLpAmount(
  solana: Solana,
  walletAddress: PublicKey,
  pool: RaydiumAmmPool,
): Promise<{
  lpTokenAmount: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
}> {
  const { poolInfo, rpcData } = pool;
  const lpTokenAccounts = await solana.connection.getTokenAccountsByOwner(walletAddress, {
    mint: new PublicKey(poolInfo.lpMint.address),
  });

  if (lpTokenAccounts.value.length === 0) {
    return { lpTokenAmount: 0, baseTokenAmount: 0, quoteTokenAmount: 0 };
  }

  const accountInfo = await solana.connection.getTokenAccountBalance(lpTokenAccounts.value[0].pubkey);
  const lpBalance = new BN(accountInfo.value.amount);
  if (lpBalance.isZero()) {
    return { lpTokenAmount: 0, baseTokenAmount: 0, quoteTokenAmount: 0 };
  }

  // Raw LP supply: AMM v4 tracks it as lpReserve, CPMM as lpAmount.
  const lpSupply = pool.poolType === 'amm' ? pool.rpcData.lpReserve : pool.rpcData.lpAmount;
  const share = (reserve: BN, decimals: number) =>
    new Decimal(lpBalance.mul(reserve).div(lpSupply).toString()).div(10 ** decimals).toNumber();

  return {
    lpTokenAmount: accountInfo.value.uiAmount,
    baseTokenAmount: share(rpcData.baseReserve, poolInfo.mintA.decimals),
    quoteTokenAmount: share(rpcData.quoteReserve, poolInfo.mintB.decimals),
  };
}

/**
 * Standardized network-first position-info fetcher for the Raydium AMM/CPMM connector.
 * Imported by the unified /trading/amm dispatcher and by the Fastify route below.
 */
export async function getPositionInfo(
  network: string,
  poolAddress: string,
  walletAddress: string,
): Promise<PositionInfo> {
  // Validate wallet address
  let walletPublicKey: PublicKey;
  try {
    // Read-only: the address does not need to be a wallet stored in Gateway
    walletPublicKey = new PublicKey(walletAddress);
  } catch (error) {
    throw httpErrors.badRequest('Invalid wallet address');
  }

  const raydium = await Raydium.getInstance(network);
  const solana = await Solana.getInstance(network);

  // Validate pool address
  try {
    new PublicKey(poolAddress);
  } catch (error) {
    throw httpErrors.badRequest('Invalid pool address');
  }

  const pool = await raydium.getAmmPoolFromRpc(poolAddress);
  const { poolInfo } = pool;

  const { lpTokenAmount, baseTokenAmount, quoteTokenAmount } = await calculateLpAmount(solana, walletPublicKey, pool);

  return {
    poolAddress,
    walletAddress,
    baseTokenAddress: poolInfo.mintA.address,
    quoteTokenAddress: poolInfo.mintB.address,
    lpTokenAmount: lpTokenAmount,
    baseTokenAmount,
    quoteTokenAmount,
    price: poolInfo.price,
  };
}

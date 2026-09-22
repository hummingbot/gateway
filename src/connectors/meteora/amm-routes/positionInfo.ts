import { q64ToDecimal } from '@meteora-ag/cp-amm-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { PositionInfo, PositionDetail } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { MeteoraDamm } from '../meteora-damm';

/**
 * Standard AMM position-info entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. DAMM v2 positions are NFTs; a wallet may hold several per pool. The top-level amounts
 * are the aggregate; `positions[]` breaks them out per NFT so callers can target a specific position
 * (pass its `positionAddress` to remove-liquidity / add-liquidity).
 */
export async function getPositionInfo(
  network: string,
  poolAddress: string,
  walletAddress: string,
): Promise<PositionInfo> {
  try {
    new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest('Invalid wallet address');
  }

  const meteoraDamm = await MeteoraDamm.getInstance(network);
  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const { tokenADecimal, tokenBDecimal } = await meteoraDamm.getTokenDecimals(poolState);
  const price = meteoraDamm.getPrice(poolState, tokenADecimal, tokenBDecimal);

  const positions = await meteoraDamm.getUserPositions(poolAddress, walletAddress);

  const toUi = (raw: BN, decimals: number) => new Decimal(raw.toString()).div(new Decimal(10).pow(decimals)).toNumber();

  let totalLiquidity = new BN(0);
  let baseRaw = new BN(0);
  let quoteRaw = new BN(0);
  const breakdown: PositionDetail[] = [];
  for (const { position, positionState } of positions) {
    const liquidity = positionState.unlockedLiquidity;
    if (liquidity.isZero()) continue;
    totalLiquidity = totalLiquidity.add(liquidity);
    const wq = meteoraDamm.cpAmm.getWithdrawQuote({
      liquidityDelta: liquidity,
      minSqrtPrice: poolState.sqrtMinPrice,
      maxSqrtPrice: poolState.sqrtMaxPrice,
      sqrtPrice: poolState.sqrtPrice,
      collectFeeMode: poolState.collectFeeMode,
      tokenAAmount: poolState.tokenAAmount,
      tokenBAmount: poolState.tokenBAmount,
      liquidity: poolState.liquidity,
    });
    baseRaw = baseRaw.add(wq.outAmountA);
    quoteRaw = quoteRaw.add(wq.outAmountB);
    breakdown.push({
      positionAddress: position.toBase58(),
      lpTokenAmount: Number(q64ToDecimal(liquidity).toString()),
      baseTokenAmount: toUi(wq.outAmountA, tokenADecimal),
      quoteTokenAmount: toUi(wq.outAmountB, tokenBDecimal),
    });
  }

  return {
    poolAddress,
    walletAddress,
    baseTokenAddress: poolState.tokenAMint.toBase58(),
    quoteTokenAddress: poolState.tokenBMint.toBase58(),
    // DAMM v2 has no fungible LP token; report the aggregate position liquidity (Q64 → decimal).
    lpTokenAmount: Number(q64ToDecimal(totalLiquidity).toString()),
    baseTokenAmount: toUi(baseRaw, tokenADecimal),
    quoteTokenAmount: toUi(quoteRaw, tokenBDecimal),
    price,
    positions: breakdown,
  };
}

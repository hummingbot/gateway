import { q64ToDecimal } from '@meteora-ag/cp-amm-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { GetPositionInfoRequestType, PositionInfo, PositionInfoSchema } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraAmmGetPositionInfoRequest } from '../schemas';

/**
 * Standard AMM position-info entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. DAMM v2 positions are NFTs; amounts are summed across the wallet's positions in the pool.
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

  let totalLiquidity = new BN(0);
  let baseRaw = new BN(0);
  let quoteRaw = new BN(0);
  for (const { positionState } of positions) {
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
  }

  const toUi = (raw: BN, decimals: number) => new Decimal(raw.toString()).div(new Decimal(10).pow(decimals)).toNumber();

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
  };
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description:
          "Get the wallet's aggregated liquidity in a Meteora DAMM v2 pool. DAMM v2 positions " +
          'are NFTs; amounts sum across all of the wallet positions in the pool.',
        tags: ['/connector/meteora'],
        querystring: MeteoraAmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request): Promise<PositionInfo> => {
      try {
        const { poolAddress, walletAddress, network } = request.query;
        return await getPositionInfo(network, poolAddress, walletAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to fetch position info');
      }
    },
  );
};

export default positionInfoRoute;

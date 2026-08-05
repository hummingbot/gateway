import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraAmmRemoveLiquidityRequest } from '../schemas';

function withSlippageDown(raw: BN, slippagePct: number): BN {
  return new BN(new Decimal(raw.toString()).mul(1 - slippagePct / 100).toFixed(0));
}

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<RemoveLiquidityResponseType> {
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('percentageToRemove must be between 0 and 100');
  }

  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const poolState = await meteoraDamm.getPoolState(poolAddress);
  const { tokenAProgram, tokenBProgram } = meteoraDamm.getTokenPrograms(poolState);

  // DAMM v2 positions are NFTs; operate on the wallet's largest position in this pool.
  const positions = await meteoraDamm.getUserPositions(poolAddress, walletAddress);
  if (positions.length === 0) {
    throw httpErrors.notFound(`No DAMM v2 position found for wallet in pool ${poolAddress}`);
  }
  const target = positions[0];
  const unlocked = target.positionState.unlockedLiquidity;
  if (unlocked.isZero()) {
    throw httpErrors.badRequest('Position has no unlocked liquidity to remove');
  }

  // Remove the requested fraction of unlocked liquidity (100% takes the exact unlocked amount).
  const liquidityDelta =
    percentageToRemove === 100
      ? unlocked
      : new BN(new Decimal(unlocked.toString()).mul(percentageToRemove / 100).toFixed(0));

  const withdrawQuote = meteoraDamm.cpAmm.getWithdrawQuote({
    liquidityDelta,
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
    sqrtPrice: poolState.sqrtPrice,
    collectFeeMode: poolState.collectFeeMode,
    tokenAAmount: poolState.tokenAAmount,
    tokenBAmount: poolState.tokenBAmount,
    liquidity: poolState.liquidity,
  });

  const vestings = (await meteoraDamm.cpAmm.getAllVestingsByPosition(target.position)).map((v) => ({
    account: v.publicKey,
    vestingState: v.account,
  }));

  const slot = await solana.connection.getSlot();
  const time = await solana.connection.getBlockTime(slot);
  const currentPoint = meteoraDamm.getCurrentPoint(poolState, slot, time ?? Math.floor(Date.now() / 1000));

  logger.info(`Removing ${percentageToRemove}% liquidity from DAMM v2 position ${target.position.toBase58()}`);

  const transaction: Transaction = await meteoraDamm.cpAmm.removeLiquidity({
    owner: new PublicKey(walletAddress),
    pool: new PublicKey(poolAddress),
    position: target.position,
    positionNftAccount: target.positionNftAccount,
    liquidityDelta,
    tokenAAmountThreshold: withSlippageDown(withdrawQuote.outAmountA, slippagePct),
    tokenBAmountThreshold: withSlippageDown(withdrawQuote.outAmountB, slippagePct),
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram,
    tokenBProgram,
    vestings,
    currentPoint,
  });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      poolState.tokenAMint.toBase58(),
      poolState.tokenBMint.toBase58(),
    ]);
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: txData.meta.fee / 1e9,
        baseTokenAmountRemoved: Math.abs(balanceChanges[0]),
        quoteTokenAmountRemoved: Math.abs(balanceChanges[1]),
      },
    };
  }
  return { signature, status: 0 }; // PENDING
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: typeof MeteoraAmmRemoveLiquidityRequest.static;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from the wallet position in a Meteora DAMM v2 pool',
        tags: ['/connector/meteora'],
        body: MeteoraAmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, poolAddress, percentageToRemove } = request.body;
        return await removeLiquidity(
          network,
          walletAddress,
          poolAddress,
          percentageToRemove,
          MeteoraConfig.config.slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;

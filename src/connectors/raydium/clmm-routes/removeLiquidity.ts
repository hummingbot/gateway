import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

export async function removeLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  closePosition: boolean = false,
  priorityFeePerCU?: number,
  computeUnits?: number,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  const positionInfo = await raydium.getClmmPosition(positionAddress);
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(
    positionInfo.poolId.toBase58(),
  );

  if (positionInfo.liquidity.isZero()) {
    throw new Error('Position has zero liquidity - nothing to remove');
  }
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw new Error('Invalid percentageToRemove - must be between 0 and 100');
  }

  const liquidityToRemove = new BN(
    new Decimal(positionInfo.liquidity.toString())
      .mul(percentageToRemove / 100)
      .toFixed(0),
  );

  logger.info(
    `Removing ${percentageToRemove.toFixed(4)}% liquidity from position ${positionAddress}`,
  );

  // Use provided compute units or default
  const COMPUTE_UNITS = computeUnits || 600000;

  // Use provided priority fee or default to 0
  const finalPriorityFeePerCU = priorityFeePerCU || 0;
  const { transaction } = await raydium.raydiumSDK.clmm.decreaseLiquidity({
    poolInfo,
    poolKeys,
    ownerPosition: positionInfo,
    ownerInfo: {
      useSOLBalance: true,
      closePosition: closePosition,
    },
    liquidity: liquidityToRemove,
    amountMinA: new BN(0),
    amountMinB: new BN(0),
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: COMPUTE_UNITS,
      microLamports: finalPriorityFeePerCU,
    },
  });

  transaction.sign([wallet]);
  await solana.simulateTransaction(transaction);

  const { confirmed, signature, txData } =
    await solana.sendAndConfirmRawTransaction(transaction);

  // Return with status
  if (confirmed && txData) {
    // Transaction confirmed, return full data
    const tokenAInfo = await solana.getToken(poolInfo.mintA.address);
    const tokenBInfo = await solana.getToken(poolInfo.mintB.address);

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(
      signature,
      wallet.publicKey.toBase58(),
      [tokenAInfo.address, tokenBInfo.address],
    );

    const baseTokenBalanceChange = balanceChanges[0];
    const quoteTokenBalanceChange = balanceChanges[1];

    logger.info(
      `Liquidity removed from position ${positionAddress}: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${poolInfo.mintA.symbol}, ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${poolInfo.mintB.symbol}`,
    );

    const totalFee = txData.meta.fee;
    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        baseTokenAmountRemoved: Math.abs(baseTokenBalanceChange),
        quoteTokenAmountRemoved: Math.abs(quoteTokenBalanceChange),
      },
    };
  } else {
    // Transaction pending, return for Hummingbot to handle retry
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
          },
        },
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          positionAddress,
          percentageToRemove,
          priorityFeePerCU,
          computeUnits,
        } = request.body;

        return await removeLiquidity(
          fastify,
          network,
          walletAddress,
          positionAddress,
          percentageToRemove,
          false,
          priorityFeePerCU,
          computeUnits,
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

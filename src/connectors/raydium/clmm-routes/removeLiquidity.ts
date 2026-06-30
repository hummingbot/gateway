import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmRemoveLiquidityRequest } from '../schemas';

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  closePosition: boolean = false,
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Set the SDK owner to the wallet's public key — works for every wallet type (local,
  // hardware, Swig PDA). The tx is built unsigned; signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which signs for the wallet's type.
  await raydium.setOwner(new PublicKey(walletAddress));

  const positionInfo = await raydium.getClmmPosition(positionAddress);
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(positionInfo.poolId.toBase58());

  if (positionInfo.liquidity.isZero()) {
    throw new Error('Position has zero liquidity - nothing to remove');
  }
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw new Error('Invalid percentageToRemove - must be between 0 and 100');
  }

  const liquidityToRemove = new BN(
    new Decimal(positionInfo.liquidity.toString()).mul(percentageToRemove / 100).toFixed(0),
  );

  logger.info(`Removing ${percentageToRemove.toFixed(4)}% liquidity from position ${positionAddress}`);

  // Use hardcoded compute units for remove liquidity
  const COMPUTE_UNITS = 600000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

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
      microLamports: priorityFeePerCU,
    },
  });

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware/Swig and
  // simulates the non-Swig path internally).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  const confirmed = txData !== null;

  // Return with status
  if (confirmed && txData) {
    // Transaction confirmed, return full data
    const tokenAInfo = await solana.getToken(poolInfo.mintA.address);
    const tokenBInfo = await solana.getToken(poolInfo.mintB.address);

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      tokenAInfo?.address || poolInfo.mintA.address,
      tokenBInfo?.address || poolInfo.mintB.address,
    ]);

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
    Body: Static<typeof RaydiumClmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, percentageToRemove } = request.body;

        return await removeLiquidity(network, walletAddress, positionAddress, percentageToRemove, false);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;

import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';
import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana, BASE_FEE } from '../../../chains/solana/solana';
import {
  ClosePositionResponse,
  ClosePositionRequestType,
  ClosePositionResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmClosePositionRequest } from '../schemas';

import { removeLiquidity } from './removeLiquidity';

async function closePosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  priorityFeePerCU?: number,
  computeUnits?: number,
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await Raydium.getInstance(network);

    // Prepare wallet and check if it's hardware
    const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

    const position = await raydium.getClmmPosition(positionAddress);
    logger.debug('Position Info:', position);

    // Handle positions with remaining liquidity first
    if (!position.liquidity.isZero()) {
      const [poolInfo] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());
      const baseTokenInfo = await solana.getToken(poolInfo.mintA.address);
      const quoteTokenInfo = await solana.getToken(poolInfo.mintB.address);

      // When closePosition: true, the SDK removes liquidity AND collects fees in one transaction
      const removeLiquidityResponse = await removeLiquidity(
        _fastify,
        network,
        walletAddress,
        positionAddress,
        100,
        true,
        priorityFeePerCU,
        computeUnits,
      );

      if (removeLiquidityResponse.status === 1 && removeLiquidityResponse.data) {
        // Use the new helper to extract balance changes including SOL handling
        const { baseTokenChange, quoteTokenChange, rent } = await solana.extractClmmBalanceChanges(
          removeLiquidityResponse.signature,
          walletAddress,
          baseTokenInfo,
          quoteTokenInfo,
          removeLiquidityResponse.data.fee * 1e9,
        );

        // The total balance change includes both liquidity removal and fee collection
        // Since we know the liquidity amounts from removeLiquidity response,
        // we can calculate the fee amounts
        const baseFeeCollected = Math.abs(baseTokenChange) - removeLiquidityResponse.data.baseTokenAmountRemoved;
        const quoteFeeCollected = Math.abs(quoteTokenChange) - removeLiquidityResponse.data.quoteTokenAmountRemoved;

        return {
          signature: removeLiquidityResponse.signature,
          status: removeLiquidityResponse.status,
          data: {
            fee: removeLiquidityResponse.data.fee,
            positionRentRefunded: rent,
            baseTokenAmountRemoved: removeLiquidityResponse.data.baseTokenAmountRemoved,
            quoteTokenAmountRemoved: removeLiquidityResponse.data.quoteTokenAmountRemoved,
            baseFeeAmountCollected: Math.max(0, baseFeeCollected),
            quoteFeeAmountCollected: Math.max(0, quoteFeeCollected),
          },
        };
      } else {
        // Return pending status without data
        return {
          signature: removeLiquidityResponse.signature,
          status: removeLiquidityResponse.status,
        };
      }
    }

    // Original close position logic for empty positions
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());
    logger.debug('Pool Info:', poolInfo);

    const result = await raydium.raydiumSDK.clmm.closePosition({
      poolInfo,
      poolKeys,
      ownerPosition: position,
      txVersion: TxVersion.V0,
    });

    logger.info('Close position transaction created:', result.transaction);

    // Use provided compute units or default
    const COMPUTE_UNITS = computeUnits || 200000;

    // Sign transaction using helper
    const signedTransaction = await raydium.signTransaction(
      result.transaction,
      walletAddress,
      isHardwareWallet,
      wallet
    ) as VersionedTransaction;

    const { signature, fee } = await solana.sendAndConfirmVersionedTransaction(
      signedTransaction,
      [], // No additional signers needed, already signed
      COMPUTE_UNITS,
    );

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      'So11111111111111111111111111111111111111112',
    ]);
    const rentRefunded = Math.abs(balanceChanges[0]);

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee,
        positionRentRefunded: rentRefunded,
        baseTokenAmountRemoved: 0,
        quoteTokenAmountRemoved: 0,
        baseFeeAmountCollected: 0,
        quoteFeeAmountCollected: 0,
      },
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof RaydiumClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, priorityFeePerCU, computeUnits } = request.body;
        const networkToUse = network;

        return await closePosition(
          fastify,
          networkToUse,
          walletAddress,
          positionAddress,
          priorityFeePerCU,
          computeUnits,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;

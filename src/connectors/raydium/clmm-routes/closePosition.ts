import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana, BASE_FEE } from '../../../chains/solana/solana';
import {
  ClosePositionRequest,
  ClosePositionResponse,
  ClosePositionRequestType,
  ClosePositionResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

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
    const wallet = await solana.getWallet(walletAddress);

    const position = await raydium.getClmmPosition(positionAddress);
    logger.debug('Position Info:', position);

    // Handle positions with remaining liquidity first
    if (!position.liquidity.isZero()) {
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

      const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(
        removeLiquidityResponse.signature,
        0,
      );
      const rentRefunded = Math.abs(balanceChange);

      return {
        signature: removeLiquidityResponse.signature,
        status: removeLiquidityResponse.status,
        data: removeLiquidityResponse.data ? {
          fee: removeLiquidityResponse.data.fee,
          positionRentRefunded: rentRefunded,
          baseTokenAmountRemoved: removeLiquidityResponse.data.baseTokenAmountRemoved,
          quoteTokenAmountRemoved:
            removeLiquidityResponse.data.quoteTokenAmountRemoved,
          baseFeeAmountCollected: 0,
          quoteFeeAmountCollected: 0,
        } : undefined,
      };
    }

    // Original close position logic for empty positions
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(
      position.poolId.toBase58(),
    );
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
    
    // Use provided priority fee per CU or estimate default
    let finalPriorityFeePerCU: number;
    if (priorityFeePerCU !== undefined) {
      finalPriorityFeePerCU = priorityFeePerCU;
    } else {
      // Calculate default if not provided
      const currentPriorityFee = (await solana.estimateGas()) * 1e9 - BASE_FEE;
      finalPriorityFeePerCU = Math.floor((currentPriorityFee * 1e6) / COMPUTE_UNITS);
    }

    const { signature, fee } = await solana.sendAndConfirmVersionedTransaction(
      result.transaction,
      [wallet],
      COMPUTE_UNITS,
    );

    const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(
      signature,
      0,
    );
    const rentRefunded = Math.abs(balanceChange);

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
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';

  const foundWallet = await solana.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }

  // Update schema example
  ClosePositionRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: ClosePositionRequestType;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Raydium CLMM position',
        tags: ['raydium/clmm'],
        body: {
          ...ClosePositionRequest,
          properties: {
            ...ClosePositionRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            positionAddress: { type: 'string' },
          },
        },
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress, priorityFeePerCU, computeUnits } = request.body;
        const networkToUse = network || 'mainnet-beta';

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

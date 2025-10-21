import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponse, ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { buildClosePositionTransaction } from '../pancakeswap-sol-utils';
import { PancakeswapSolClmmClosePositionRequest } from '../schemas';

async function closePosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Validate position exists
  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw _fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  // Check that position has no liquidity
  if (positionInfo.baseTokenAmount > 0 || positionInfo.quoteTokenAmount > 0) {
    throw _fastify.httpErrors.badRequest(
      'Position must have zero liquidity before closing. Use removeLiquidity to remove all liquidity first.',
    );
  }

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const positionNftMint = new PublicKey(positionAddress);

  logger.info('Closing PancakeSwap Solana CLMM position...');

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction
  const transaction = await buildClosePositionTransaction(
    solana,
    positionNftMint,
    walletPubkey,
    400000, // Compute units
    priorityFeePerCU,
  );

  // Sign and send
  transaction.sign([wallet]);
  await solana.simulateWithErrorHandling(transaction, _fastify);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    logger.info(`Position closed successfully. Signature: ${signature}`);

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        positionRentRefunded: 0, // Position rent refund (simplified - not calculated)
        baseTokenAmountRemoved: 0,
        quoteTokenAmountRemoved: 0,
        baseFeeAmountCollected: 0,
        quoteFeeAmountCollected: 0,
      },
    };
  }

  return {
    signature,
    status: 0, // PENDING
  };
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapSolClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close an empty PancakeSwap Solana CLMM position (NFT must have zero liquidity)',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', walletAddress, positionAddress } = request.body;

        return await closePosition(fastify, network, walletAddress!, positionAddress);
      } catch (e: any) {
        logger.error('Close position error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to close position';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default closePositionRoute;

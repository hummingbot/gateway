import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponse, ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSol, PANCAKESWAP_CLMM_PROGRAM_ID } from '../pancakeswap-sol';
import { buildDecreaseLiquidityV2Instruction, buildClosePositionInstruction } from '../pancakeswap-sol.instructions';
import { parsePositionData } from '../pancakeswap-sol.parser';
import { buildTransactionWithInstructions } from '../pancakeswap-sol.transactions';
import { PancakeswapSolClmmClosePositionRequest } from '../schemas';

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Validate position exists and get info
  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const positionNftMint = new PublicKey(positionAddress);

  // Get position account to read actual liquidity
  const [personalPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), positionNftMint.toBuffer()],
    PANCAKESWAP_CLMM_PROGRAM_ID,
  );

  const positionAccountInfo = await solana.connection.getAccountInfo(personalPosition);
  if (!positionAccountInfo) {
    throw httpErrors.notFound(`Position account not found: ${personalPosition.toString()}`);
  }

  // Parse position data to get liquidity (like removeLiquidity.ts)
  const { liquidity } = parsePositionData(positionAccountInfo.data);
  const hasLiquidity = liquidity.gt(new BN(0));

  logger.info(`Closing position ${positionAddress}, has liquidity: ${hasLiquidity}`);
  if (hasLiquidity) {
    logger.info(`  Liquidity: ${liquidity.toString()} (will be removed)`);
  }

  // Get tokens for balance tracking
  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound('Token information not found');
  }

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction with both instructions (like successful manual transaction)
  const instructions = [];

  // 1. If position has liquidity, remove it all first
  if (hasLiquidity) {
    const removeLiquidityIx = await buildDecreaseLiquidityV2Instruction(
      solana,
      positionNftMint,
      walletPubkey,
      liquidity, // Remove all liquidity (already a BN)
      new BN(0), // amount0Min = 0 (accept any amount)
      new BN(0), // amount1Min = 0
    );
    instructions.push(removeLiquidityIx);
  }

  // 2. Close position and burn NFT
  const closePositionIx = await buildClosePositionInstruction(solana, positionNftMint, walletPubkey);
  instructions.push(closePositionIx);

  // Build complete transaction
  const transaction = await buildTransactionWithInstructions(
    solana,
    walletPubkey,
    instructions,
    800000, // Compute units for both operations
    priorityFeePerCU,
  );

  // Sign and send
  transaction.sign([wallet]);
  await solana.simulateWithErrorHandling(transaction);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseToken.address,
      quoteToken.address,
    ]);

    const baseTokenChange = balanceChanges[0];
    const quoteTokenChange = balanceChanges[1];

    logger.info(`Position closed successfully. Signature: ${signature}`);
    logger.info(
      `Removed ${Math.abs(baseTokenChange).toFixed(4)} ${baseToken.symbol}, ${Math.abs(quoteTokenChange).toFixed(4)} ${quoteToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        positionRentRefunded: 0, // Position rent refund (simplified)
        baseTokenAmountRemoved: Math.abs(baseTokenChange),
        quoteTokenAmountRemoved: Math.abs(quoteTokenChange),
        baseFeeAmountCollected: 0, // Included in balance changes
        quoteFeeAmountCollected: 0, // Included in balance changes
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
        description: 'Close a PancakeSwap Solana CLMM position and remove all liquidity and fees if present',
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

        return await closePosition(network, walletAddress!, positionAddress);
      } catch (e: any) {
        logger.error('Close position error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to close position';
        throw httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default closePositionRoute;

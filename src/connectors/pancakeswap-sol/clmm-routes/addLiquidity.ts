import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolConfig } from '../pancakeswap-sol.config';
import { buildAddLiquidityTransaction } from '../pancakeswap-sol.transactions';
import { PancakeswapSolClmmAddLiquidityRequest } from '../schemas';

import { quotePosition } from './quotePosition';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = PancakeswapSolConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get position info
  const positionInfo = await pancakeswapSol.getPositionInfo(positionAddress);
  if (!positionInfo) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = new PublicKey(walletAddress);
  const positionNftMint = new PublicKey(positionAddress);

  // Get token info
  const baseToken = await solana.getToken(positionInfo.baseTokenAddress);
  const quoteToken = await solana.getToken(positionInfo.quoteTokenAddress);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound('Token information not found');
  }

  // Get quote for position amounts (same as Raydium approach)
  // This calculates proper amounts based on position's tick range and current pool price
  const quote = await quotePosition(
    network,
    positionInfo.lowerPrice,
    positionInfo.upperPrice,
    positionInfo.poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
  );

  logger.info(
    `Adding liquidity to position ${positionAddress}: ${baseTokenAmount} ${baseToken.symbol}, ${quoteTokenAmount} ${quoteToken.symbol}`,
  );
  logger.info(
    `Quote: baseLimited=${quote.baseLimited}, base=${quote.baseTokenAmount}, quote=${quote.quoteTokenAmount}`,
  );
  logger.info(`Quote Max: base=${quote.baseTokenAmountMax}, quote=${quote.quoteTokenAmountMax}`);
  logger.info(`Quote Liquidity: ${quote.liquidity}`);

  // Apply slippage buffer (same as openPosition and Raydium)
  const effectiveSlippage = slippagePct ?? PancakeswapSolConfig.config.slippagePct;
  const amount0Max = new BN(
    (quote.baseTokenAmountMax * (1 + effectiveSlippage / 100) * 10 ** baseToken.decimals).toFixed(0),
  );
  const amount1Max = new BN(
    (quote.quoteTokenAmountMax * (1 + effectiveSlippage / 100) * 10 ** quoteToken.decimals).toFixed(0),
  );

  // Use actual liquidity from quote (like your successful transaction)
  const liquidity = new BN(quote.liquidity);

  logger.info(`Amounts with slippage (${effectiveSlippage}%):`);
  logger.info(`  liquidity: ${liquidity.toString()}`);
  logger.info(`  amount0Max: ${amount0Max.toString()} (${baseToken.symbol})`);
  logger.info(`  amount1Max: ${amount1Max.toString()} (${quoteToken.symbol})`);

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction with actual liquidity (like your successful transaction)
  const transaction = await buildAddLiquidityTransaction(
    solana,
    positionNftMint,
    walletPubkey,
    liquidity,
    amount0Max,
    amount1Max,
    600000,
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

    logger.info(`Liquidity added successfully. Signature: ${signature}`);
    logger.info(
      `Added ${Math.abs(baseTokenChange).toFixed(4)} ${baseToken.symbol}, ${Math.abs(quoteTokenChange).toFixed(4)} ${quoteToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        fee: totalFee / 1e9,
        baseTokenAmountAdded: Math.abs(baseTokenChange),
        quoteTokenAmountAdded: Math.abs(quoteTokenChange),
      },
    };
  }

  return {
    signature,
    status: 0, // PENDING
  };
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapSolClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an existing PancakeSwap Solana CLMM position',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        return await addLiquidity(
          network,
          walletAddress!,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Add liquidity error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to add liquidity';
        throw httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default addLiquidityRoute;

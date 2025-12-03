import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { ExecuteSwapResponseType, ExecuteSwapResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmExecuteSwapRequest, MeteoraClmmExecuteSwapRequestType } from '../schemas';

import { getRawSwapQuote } from './quoteSwap';

export async function executeSwap(
  network: string,
  address: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const wallet = await solana.getWallet(address);

  const {
    inputToken,
    outputToken,
    swapAmount,
    quote: swapQuote,
    dlmmPool,
  } = await getRawSwapQuote(network, baseTokenIdentifier, quoteTokenIdentifier, amount, side, poolAddress, slippagePct);

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`);

  const swapTx =
    side === 'BUY'
      ? await dlmmPool.swapExactOut({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          outAmount: (swapQuote as SwapQuoteExactOut).outAmount,
          maxInAmount: (swapQuote as SwapQuoteExactOut).maxInAmount,
          lbPair: dlmmPool.pubkey,
          user: wallet.publicKey,
          binArraysPubkey: (swapQuote as SwapQuoteExactOut).binArraysPubkey,
        })
      : await dlmmPool.swap({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          inAmount: swapAmount,
          minOutAmount: (swapQuote as SwapQuote).minOutAmount,
          lbPair: dlmmPool.pubkey,
          user: wallet.publicKey,
          binArraysPubkey: (swapQuote as SwapQuote).binArraysPubkey,
        });

  // Simulate transaction with proper error handling (before signing)
  await solana.simulateWithErrorHandling(swapTx);

  logger.info('Transaction simulated successfully, sending to network...');

  // Send and confirm transaction using sendAndConfirmTransaction which handles signing
  const { signature, fee } = await solana.sendAndConfirmTransaction(swapTx, [wallet]);

  logger.info(`Transaction sent with signature: ${signature}`);

  // Get transaction data for confirmation
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const confirmed = txData !== null;

  // Handle confirmation status
  if (confirmed && txData) {
    // Extract fee from the response
    const txFee = fee;
    // Transaction confirmed, extract balance changes
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, wallet.publicKey.toBase58(), [
      inputToken.address,
      outputToken.address,
    ]);

    const inputTokenBalanceChange = balanceChanges[0];
    const outputTokenBalanceChange = balanceChanges[1];

    // Calculate actual amounts swapped
    const amountIn = Math.abs(inputTokenBalanceChange);
    const amountOut = Math.abs(outputTokenBalanceChange);

    // For CLMM swaps, determine base/quote changes based on side
    const baseTokenBalanceChange = side === 'SELL' ? inputTokenBalanceChange : outputTokenBalanceChange;
    const quoteTokenBalanceChange = side === 'SELL' ? outputTokenBalanceChange : inputTokenBalanceChange;

    logger.info(
      `Swap executed successfully: ${amountIn.toFixed(4)} ${inputToken.symbol} -> ${amountOut.toFixed(4)} ${outputToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        tokenIn: inputToken.address,
        tokenOut: outputToken.address,
        amountIn,
        amountOut,
        fee: txFee,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
      },
    };
  } else {
    // Transaction not confirmed
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: MeteoraClmmExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a token swap on Meteora DLMM',
        tags: ['/connector/meteora'],
        body: MeteoraClmmExecuteSwapRequest,
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body;

        // Use defaults if not provided
        const networkUsed = network || getSolanaChainConfig().defaultNetwork;
        const walletAddressUsed = walletAddress || getSolanaChainConfig().defaultWallet;

        let poolAddressUsed = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressUsed) {
          const solana = await Solana.getInstance(networkUsed);

          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw httpErrors.badRequest(
              sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'meteora',
            networkUsed,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Meteora`,
            );
          }

          poolAddressUsed = pool.address;
        }
        logger.info(`Received swap request: ${amount} ${baseToken} -> ${quoteToken} in pool ${poolAddressUsed}`);

        return await executeSwap(
          networkUsed,
          walletAddressUsed,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressUsed,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Error executing swap:', e.message || e);
        logger.error('Full error:', JSON.stringify(e, null, 2));

        if (e.statusCode) {
          // If it's already an HTTP error, throw it properly
          throw e;
        }

        // Check for specific error messages
        const errorMessage = e.message || e.toString();
        if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
          throw httpErrors.createError(503, 'RPC service temporarily unavailable. Please try again.');
        }

        throw httpErrors.internalServerError(`Swap execution failed: ${errorMessage}`);
      }
    },
  );
};

export default executeSwapRoute;

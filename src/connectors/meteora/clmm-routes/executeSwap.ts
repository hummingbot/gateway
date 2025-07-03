import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
  ExecuteSwapRequestType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Meteora } from '../meteora';

import { getRawSwapQuote } from './quoteSwap';
import { MeteoraClmmExecuteSwapRequest } from './schemas';

async function executeSwap(
  fastify: FastifyInstance,
  network: string,
  address: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number,
  priorityFeePerCU?: number,
  computeUnits?: number,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  const {
    inputToken,
    outputToken,
    swapAmount,
    quote: swapQuote,
    dlmmPool,
  } = await getRawSwapQuote(
    fastify,
    network,
    baseTokenIdentifier,
    quoteTokenIdentifier,
    amount,
    side,
    poolAddress,
    slippagePct || meteora.getSlippagePct(),
  );

  logger.info(
    `Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`,
  );

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

  // Use provided compute units or default
  const finalComputeUnits = computeUnits || 150000;

  // Note: Meteora SDK doesn't support custom compute budget configuration in swap methods
  // The priority fee will be handled by Solana's sendAndConfirmTransaction method internally
  // For now, we'll use the default behavior and document this limitation

  logger.info(
    `Executing swap with ${finalComputeUnits} compute units${priorityFeePerCU ? ` and ${priorityFeePerCU} microlamports/CU priority fee` : ''}`,
  );

  // Use the existing method - it will use estimateGas internally for fee calculation
  const { signature, fee } = await solana.sendAndConfirmTransaction(
    swapTx,
    [wallet],
    finalComputeUnits,
    priorityFeePerCU,
  );

  const { baseTokenBalanceChange, quoteTokenBalanceChange } =
    await solana.extractPairBalanceChangesAndFee(
      signature,
      await solana.getToken(dlmmPool.tokenX.publicKey.toBase58()),
      await solana.getToken(dlmmPool.tokenY.publicKey.toBase58()),
      wallet.publicKey.toBase58(),
    );

  logger.info(
    `Swap executed successfully: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`,
  );

  // Determine total amounts swapped
  const totalInputSwapped =
    side === 'SELL'
      ? Math.abs(baseTokenBalanceChange)
      : Math.abs(quoteTokenBalanceChange);
  const totalOutputSwapped =
    side === 'SELL'
      ? Math.abs(quoteTokenBalanceChange)
      : Math.abs(baseTokenBalanceChange);

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      totalInputSwapped,
      totalOutputSwapped,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      tokenInAmount: totalInputSwapped,
      tokenOutAmount: totalOutputSwapped,
      activeBinId: 0, // Meteora doesn't provide this in the same way
    },
  };
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a token swap on Meteora',
        tags: ['/connector/meteora'],
        body: {
          ...MeteoraClmmExecuteSwapRequest,
          properties: {
            ...MeteoraClmmExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
          priorityFeePerCU,
          computeUnits,
        } = request.body as typeof MeteoraClmmExecuteSwapRequest._type;
        const networkUsed = network;

        let poolAddressUsed = poolAddress;

        // If poolAddress is not provided, look it up by token pair
        if (!poolAddressUsed) {
          const solana = await Solana.getInstance(networkUsed);

          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw fastify.httpErrors.badRequest(
              sanitizeErrorMessage(
                'Token not found: {}',
                !baseTokenInfo ? baseToken : quoteToken,
              ),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import(
            '../../../services/pool-service'
          );
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'meteora',
            networkUsed,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Meteora`,
            );
          }

          poolAddressUsed = pool.address;
        }
        logger.info(
          `Received swap request: ${amount} ${baseToken} -> ${quoteToken} in pool ${poolAddress}`,
        );

        return await executeSwap(
          fastify,
          networkUsed,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressUsed,
          slippagePct,
          priorityFeePerCU,
          computeUnits,
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

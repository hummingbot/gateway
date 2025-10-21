import { Static } from '@sinclair/typebox';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponse, ExecuteSwapResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { MIN_SQRT_PRICE_X64, MAX_SQRT_PRICE_X64 } from '../pancakeswap-sol.parser';
import { buildSwapTransaction } from '../pancakeswap-sol.transactions';
import { PancakeswapSolClmmExecuteSwapRequest, PancakeswapSolClmmExecuteSwapRequestType } from '../schemas';

/**
 * Execute a swap on PancakeSwap Solana CLMM
 *
 * NOTE: This uses manual transaction building with Anchor instruction encoding
 */
export async function executeSwap(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress?: string,
  slippagePct?: number,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get token info
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw _fastify.httpErrors.notFound(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  // If no pool address provided, try to find it from pool service
  let poolAddressToUse = poolAddress;
  if (!poolAddressToUse) {
    const { PoolService } = await import('../../../services/pool-service');
    const poolService = PoolService.getInstance();

    const pool = await poolService.getPool('pancakeswap-sol', network, 'clmm', baseToken.symbol, quoteToken.symbol);

    if (!pool) {
      throw _fastify.httpErrors.notFound(`No CLMM pool found for ${baseToken.symbol}-${quoteToken.symbol}`);
    }

    poolAddressToUse = pool.address;
  }

  // Get pool info
  const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddressToUse);
  if (!poolInfo) {
    throw _fastify.httpErrors.notFound(`Pool not found: ${poolAddressToUse}`);
  }

  // Determine if baseToken matches pool's base or quote
  const isBaseTokenFirst = poolInfo.baseTokenAddress === baseToken.address;
  const currentPrice = isBaseTokenFirst ? poolInfo.price : 1 / poolInfo.price;

  logger.info(
    `Token addresses - base: ${baseToken.address}, quote: ${quoteToken.address}, pool base: ${poolInfo.baseTokenAddress}, pool quote: ${poolInfo.quoteTokenAddress}`,
  );

  const effectiveSlippage = slippagePct ?? 1.0;

  // Calculate amounts
  let amountIn: number;
  let amountOut: number;
  let inputMint: PublicKey;
  let outputMint: PublicKey;
  let isBaseInput: boolean;

  if (side === 'SELL') {
    // Selling base token for quote token
    amountIn = amount;
    amountOut = amount * currentPrice;
    inputMint = new PublicKey(baseToken.address);
    outputMint = new PublicKey(quoteToken.address);
    // isBaseInput means: is the input token the pool's token0 (base)?
    isBaseInput = inputMint.toString() === poolInfo.baseTokenAddress;

    logger.info(`SELL: input=${inputMint.toString()}, output=${outputMint.toString()}, isBaseInput=${isBaseInput}`);
  } else {
    // Buying base token with quote token
    amountOut = amount;
    amountIn = amount * currentPrice;
    inputMint = new PublicKey(quoteToken.address);
    outputMint = new PublicKey(baseToken.address);
    // isBaseInput means: is the input token the pool's token0 (base)?
    isBaseInput = inputMint.toString() === poolInfo.baseTokenAddress;

    logger.info(`BUY: input=${inputMint.toString()}, output=${outputMint.toString()}, isBaseInput=${isBaseInput}`);
  }

  // Convert to BN with decimals
  const inputToken = side === 'SELL' ? baseToken : quoteToken;
  const outputToken = side === 'SELL' ? quoteToken : baseToken;

  const amountBN = new BN(Math.floor(amountIn * 10 ** inputToken.decimals));
  const minAmountOut = amountOut * (1 - effectiveSlippage / 100);
  const otherAmountThresholdBN = new BN(Math.floor(minAmountOut * 10 ** outputToken.decimals));

  // Set sqrt price limit to 0 for no limit
  // The slippage protection is handled by otherAmountThreshold
  const sqrtPriceLimitX64 = new BN(0);

  logger.info(
    `Executing ${side} swap: ${amountIn.toFixed(6)} ${inputToken.symbol} for ${amountOut.toFixed(6)} ${outputToken.symbol} (min: ${minAmountOut.toFixed(6)})`,
  );

  // Get wallet keypair
  const wallet = await solana.getWallet(walletAddress);
  const walletPubkey = wallet.publicKey;

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction
  const transaction = await buildSwapTransaction(
    solana,
    poolAddressToUse,
    walletPubkey,
    inputMint,
    outputMint,
    amountBN,
    otherAmountThresholdBN,
    sqrtPriceLimitX64,
    isBaseInput,
    600000,
    priorityFeePerCU,
  );

  // Sign transaction
  transaction.sign([wallet]);

  // Simulate transaction
  await solana.simulateWithErrorHandling(transaction, _fastify);

  // Send and confirm transaction
  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { baseTokenChange, quoteTokenChange } = await solana.extractClmmBalanceChanges(
      signature,
      walletAddress,
      baseToken,
      quoteToken,
      totalFee,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        tokenIn: inputToken.address,
        tokenOut: outputToken.address,
        amountIn: Math.abs(side === 'SELL' ? baseTokenChange : quoteTokenChange),
        amountOut: Math.abs(side === 'SELL' ? quoteTokenChange : baseTokenChange),
        fee: totalFee / 1e9,
        baseTokenBalanceChange: baseTokenChange,
        quoteTokenBalanceChange: quoteTokenChange,
      },
    };
  } else {
    // Transaction pending
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PancakeswapSolClmmExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on PancakeSwap Solana CLMM',
        tags: ['/connector/pancakeswap-sol'],
        body: PancakeswapSolClmmExecuteSwapRequest,
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network = 'mainnet-beta',
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
        } = request.body;

        return await executeSwap(
          fastify,
          network,
          walletAddress!,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddress,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Execute swap error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to execute swap';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default executeSwapRoute;

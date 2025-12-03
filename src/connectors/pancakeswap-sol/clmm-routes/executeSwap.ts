import { Static } from '@sinclair/typebox';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponse, ExecuteSwapResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
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
  network: string,
  walletAddress: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress?: string,
  slippagePct?: number,
): Promise<ExecuteSwapResponseType> {
  // Get quote first - this contains all the slippage calculations and pool lookup
  const { quoteSwap } = await import('./quoteSwap');
  const quote = await quoteSwap(network, baseTokenSymbol, quoteTokenSymbol, amount, side, poolAddress, slippagePct);

  const solana = await Solana.getInstance(network);
  const pancakeswapSol = await PancakeswapSol.getInstance(network);

  // Get token info
  const baseToken = await solana.getToken(baseTokenSymbol);
  const quoteToken = await solana.getToken(quoteTokenSymbol);

  if (!baseToken || !quoteToken) {
    throw httpErrors.notFound(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  // Use pool address from quote
  const poolAddressToUse = quote.poolAddress;

  // Get pool info
  const poolInfo = await pancakeswapSol.getClmmPoolInfo(poolAddressToUse);
  if (!poolInfo) {
    throw httpErrors.notFound(`Pool not found: ${poolAddressToUse}`);
  }

  // Validate pool contains the requested tokens
  const poolTokens = new Set([poolInfo.baseTokenAddress, poolInfo.quoteTokenAddress]);
  const requestedTokens = new Set([baseToken.address, quoteToken.address]);

  if (!poolTokens.has(baseToken.address) || !poolTokens.has(quoteToken.address)) {
    throw httpErrors.badRequest(
      `Pool ${poolAddressToUse} does not contain the requested token pair. ` +
        `Pool has: ${poolInfo.baseTokenAddress}, ${poolInfo.quoteTokenAddress}. ` +
        `Requested: ${baseToken.symbol} (${baseToken.address}), ${quoteToken.symbol} (${quoteToken.address})`,
    );
  }

  // Determine if baseToken matches pool's base or quote
  const isBaseTokenFirst = poolInfo.baseTokenAddress === baseToken.address;
  const currentPrice = isBaseTokenFirst ? poolInfo.price : 1 / poolInfo.price;

  logger.info(
    `Token addresses - base: ${baseToken.address}, quote: ${quoteToken.address}, pool base: ${poolInfo.baseTokenAddress}, pool quote: ${poolInfo.quoteTokenAddress}`,
  );

  // Use amounts from quote - all slippage calculations are done there
  const amountIn = quote.amountIn;
  const amountOut = quote.amountOut;
  const minAmountOut = quote.minAmountOut;
  const maxAmountIn = quote.maxAmountIn;

  // Determine token mints and direction
  const inputMint = new PublicKey(quote.tokenIn);
  const outputMint = new PublicKey(quote.tokenOut);
  const inputToken = side === 'SELL' ? baseToken : quoteToken;
  const outputToken = side === 'SELL' ? quoteToken : baseToken;

  // isBaseInput means: is the input token the pool's token0 (base)?
  const isBaseInput = inputMint.toString() === poolInfo.baseTokenAddress;

  logger.info(`${side}: input=${inputMint.toString()}, output=${outputMint.toString()}, isBaseInput=${isBaseInput}`);

  // The swap_v2 instruction interprets parameters differently based on is_base_input:
  // - When is_base_input = true: amount is exact INPUT, other_amount_threshold is minimum OUTPUT
  // - When is_base_input = false: amount is exact OUTPUT, other_amount_threshold is maximum INPUT
  let amountBN: BN;
  let otherAmountThresholdBN: BN;

  if (isBaseInput) {
    // Exact input swap: we specify exact input amount and minimum output
    amountBN = new BN(Math.floor(amountIn * 10 ** inputToken.decimals));
    otherAmountThresholdBN = new BN(Math.floor(minAmountOut * 10 ** outputToken.decimals));
    logger.info(
      `Executing ${side} swap (exact input): ${amountIn.toFixed(6)} ${inputToken.symbol} for min ${minAmountOut.toFixed(6)} ${outputToken.symbol}`,
    );
  } else {
    // Exact output swap: we specify exact output amount and maximum input
    amountBN = new BN(Math.floor(amountOut * 10 ** outputToken.decimals));
    otherAmountThresholdBN = new BN(Math.floor(maxAmountIn * 10 ** inputToken.decimals));
    logger.info(
      `Executing ${side} swap (exact output): max ${maxAmountIn.toFixed(6)} ${inputToken.symbol} for ${amountOut.toFixed(6)} ${outputToken.symbol}`,
    );
  }

  // Set sqrt price limit to 0 for no limit
  // The slippage protection is handled by otherAmountThreshold
  const sqrtPriceLimitX64 = new BN(0);

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
  await solana.simulateWithErrorHandling(transaction);

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
        throw httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default executeSwapRoute;

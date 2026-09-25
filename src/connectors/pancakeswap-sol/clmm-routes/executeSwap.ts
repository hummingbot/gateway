import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { buildSwapTransaction } from '../pancakeswap-sol.transactions';

/**
 * Execute a swap on PancakeSwap Solana CLMM
 *
 * NOTE: This uses manual transaction building with Anchor instruction encoding
 */
export async function executeSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenSymbol: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct?: number,
): Promise<ExecuteSwapResponseType> {
  // Standardized: quote token is derived from the pool given poolAddress + baseToken.
  const { getRawSwapQuote, resolveCounterToken } = await import('./quoteSwap');
  const quoteTokenSymbol = await resolveCounterToken(network, poolAddress, baseTokenSymbol);

  // Get quote first - this contains all the slippage calculations and pool lookup
  const quote = await getRawSwapQuote(
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress,
    slippagePct,
  );

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

  if (!poolTokens.has(baseToken.address) || !poolTokens.has(quoteToken.address)) {
    throw httpErrors.badRequest(
      `Pool ${poolAddressToUse} does not contain the requested token pair. ` +
        `Pool has: ${poolInfo.baseTokenAddress}, ${poolInfo.quoteTokenAddress}. ` +
        `Requested: ${baseToken.symbol} (${baseToken.address}), ${quoteToken.symbol} (${quoteToken.address})`,
    );
  }

  // Determine if baseToken matches pool's base or quote

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

  const walletPubkey = new PublicKey(walletAddress);

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
  );

  // The wallet chokepoint simulates, sets the compute budget and priority fee, and signs
  // for the wallet's type (local keypair or Ledger).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error, so txData means confirmed.
  const txData = await solana.getConfirmedTransactionData(signature);

  if (txData) {
    const totalFee = txData.meta.fee;

    // Extract balance changes
    const { baseTokenChange, quoteTokenChange } = await solana.extractClmmBalanceChanges(
      signature,
      walletAddress,
      baseToken,
      quoteToken,
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
        slippagePct: quote.slippagePct,
      },
    };
  } else {
    // Confirmed, but not yet visible to the re-fetch: report it pending.
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

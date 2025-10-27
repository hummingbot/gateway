/**
 * 0x Execute Swap Operation
 *
 * One-step operation to quote and execute a swap.
 * Combines quoteSwap (firm quote) + executeQuote.
 */

import { ExecuteSwapParams, ExecuteSwapResult } from '../../types';
import { quoteSwap, QuoteSwapDependencies } from './quote-swap';
import { executeQuote, ExecuteQuoteDependencies } from './execute-quote';

export interface ExecuteSwapDependencies extends QuoteSwapDependencies, ExecuteQuoteDependencies {}

/**
 * Execute a swap operation (quote + execute in one step)
 */
export async function executeSwap(
  params: ExecuteSwapParams,
  deps: ExecuteSwapDependencies,
): Promise<ExecuteSwapResult> {
  const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct, gasPrice, maxGas } = params;

  // Step 1: Get a fresh firm quote
  const quoteResult = await quoteSwap(
    {
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
      indicativePrice: false, // Firm quote
      takerAddress: walletAddress,
    },
    deps,
  );

  // Step 2: Execute the quote immediately
  const executeResult = await executeQuote(
    {
      walletAddress,
      network,
      quoteId: quoteResult.quoteId,
      gasPrice,
      maxGas,
    },
    deps,
  );

  return executeResult;
}

import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { PancakeswapConfig } from '../pancakeswap.config';

// Import the quote and execute functions
import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  logger.info(`Executing swap: ${amount} ${baseToken} ${side} for ${quoteToken}`);

  // Step 1: Get quote
  const quoteResponse = await quoteSwap(network, walletAddress, baseToken, quoteToken, amount, side, slippagePct);

  // Step 2: Execute the quote
  const executeResponse = await executeQuote(walletAddress, network, quoteResponse.quoteId);

  return executeResponse;
}

export { executeSwap };

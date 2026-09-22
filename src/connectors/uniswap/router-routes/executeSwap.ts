import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
// eslint-disable-next-line import/order

// Import the quote and execute functions
import { UniswapConfig } from '../uniswap.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  try {
    logger.info(`Executing swap: ${amount} ${baseToken} ${side} for ${quoteToken}`);

    // Step 1: Get quote
    const quoteResponse = await quoteSwap(network, walletAddress, baseToken, quoteToken, amount, side, slippagePct);

    // Step 2: Execute the quote
    const executeResponse = await executeQuote(walletAddress, network, quoteResponse.quoteId);

    return executeResponse;
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    logger.error(`Failed to execute swap: ${error.message}`);
    throw httpErrors.internalServerError(error.message || 'Failed to execute swap');
  }
}

export { executeSwap };

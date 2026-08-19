import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { JupiterConfig } from '../jupiter.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = JupiterConfig.config.slippagePct,
  approximateIfNoExactOut: boolean = true,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh quote using the quoteSwap function
  const quoteResult = await quoteSwap(
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    approximateIfNoExactOut,
  );

  // Step 2: Execute the quote immediately (priority fees come from the connector config)
  const executeResult = await executeQuote(walletAddress, network, quoteResult.quoteId);

  return executeResult;
}

export { executeSwap };

import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { ZeroXConfig } from '../0x.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = ZeroXConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh firm quote using the quoteSwap function
  const quoteResult = await quoteSwap(
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    false, // indicativePrice = false for firm quote
    walletAddress, // takerAddress
  );

  // Step 2: Execute the quote immediately using executeQuote function
  const executeResult = await executeQuote(walletAddress, network, quoteResult.quoteId);

  return executeResult;
}

export { executeSwap };

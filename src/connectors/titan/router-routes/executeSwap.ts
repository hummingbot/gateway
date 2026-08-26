import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { TitanConfig } from '../titan.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = TitanConfig.config.slippagePct,
  approximateIfNoExactOut: boolean = true,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh quote bound to the executing wallet
  const quoteResult = await quoteSwap(
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    approximateIfNoExactOut,
    walletAddress,
  );

  // Step 2: Execute the quote immediately
  return await executeQuote(walletAddress, network, quoteResult.quoteId);
}

export { executeSwap };

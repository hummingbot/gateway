import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { PumpConfig } from '../pump.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

export async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PumpConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  // Quote fresh, then execute that exact quote (priority fees come from the chain layer).
  const quote = await quoteSwap(network, baseToken, quoteToken, amount, side, slippagePct);
  return await executeQuote(walletAddress, network, quote.quoteId);
}

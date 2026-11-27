import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { HelmswapConfig } from '../helmswap.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

export async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = HelmswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const quoteResult = await quoteSwap(network, baseToken, quoteToken, amount, side, slippagePct, false, walletAddress);
  return executeQuote(walletAddress, network, quoteResult.quoteId);
}

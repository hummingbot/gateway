import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { HelmswapSolConfig } from '../helmswap-sol.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

export async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = HelmswapSolConfig.config.slippagePct,
  approximateIfNoExactOut?: boolean,
): Promise<SwapExecuteResponseType> {
  const quoteResult = await quoteSwap(
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    approximateIfNoExactOut,
  );
  return executeQuote(walletAddress, network, quoteResult.quoteId);
}

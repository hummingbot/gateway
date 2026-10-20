import { PublicKey, Transaction } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponseType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pump } from '../pump';
import { PumpConfig } from '../pump.config';

import { getPumpSwapQuote } from './quoteSwap';

export async function executeSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = PumpConfig.config.slippagePct,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const pump = await Pump.getInstance(network);
  const walletPk = new PublicKey(walletAddress);

  // State is fetched for the executing wallet so the SDK sees its real ATAs and
  // prepends idempotent creation (plus WSOL wrap/unwrap) only where needed.
  const state = await pump.getSwapState(new PublicKey(poolAddress), walletPk);
  const quote = await getPumpSwapQuote(pump, state, baseToken, side, amount, slippagePct);

  logger.info(
    `Executing ${side} ${amount} ${baseToken} in PumpSwap pool ${poolAddress}: ` +
      `${quote.amountIn} ${quote.tokenIn.symbol} -> ${quote.amountOut} ${quote.tokenOut.symbol}`,
  );

  // The quote's plan carries the exact on-chain args, so execution enforces the
  // quoted bound rather than re-deriving one.
  const instructions =
    quote.plan.instruction === 'buy'
      ? await pump.ammSdk.buyInstructions(state, quote.plan.baseAmount, quote.plan.bound)
      : await pump.ammSdk.sellInstructions(state, quote.plan.baseAmount, quote.plan.bound);

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = walletPk;

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware/build
  // mode, simulates, and sets blockhash + compute budget internally).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Re-fetch with retry; a landed-but-failed transaction throws instead of being
  // misreported as confirmed or pending.
  const txData = await solana.getConfirmedTransactionData(signature);

  const result = await solana.handleConfirmation(
    signature,
    txData,
    quote.tokenIn.address,
    quote.tokenOut.address,
    walletAddress,
    side,
    slippagePct,
  );

  if (result.status === 1) {
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${quote.tokenIn.symbol} -> ` +
        `${result.data?.amountOut.toFixed(4)} ${quote.tokenOut.symbol}`,
    );
  }

  return result as ExecuteSwapResponseType;
}

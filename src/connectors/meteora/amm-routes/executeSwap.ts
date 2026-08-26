import { SwapMode } from '@meteora-ag/cp-amm-sdk';
import { PublicKey, Transaction } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponseType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraConfig } from '../meteora.config';

import { getRawSwapQuote } from './quoteSwap';

export async function executeSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const meteoraDamm = await MeteoraDamm.getInstance(network);

  const quote = await getRawSwapQuote(meteoraDamm, poolAddress, baseToken, side, amount, slippagePct);
  const { poolState } = quote;
  const { tokenAProgram, tokenBProgram } = meteoraDamm.getTokenPrograms(poolState);

  logger.info(`Executing ${amount} ${side} swap in Meteora DAMM v2 pool ${poolAddress}`);

  const swapParams = {
    payer: new PublicKey(walletAddress),
    pool: new PublicKey(poolAddress),
    inputTokenMint: quote.inputMint,
    outputTokenMint: quote.outputMint,
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram,
    tokenBProgram,
    referralTokenAccount: null,
    poolState,
  };

  const transaction: Transaction =
    quote.swapMode === SwapMode.ExactIn
      ? await meteoraDamm.cpAmm.swap2({
          ...swapParams,
          swapMode: SwapMode.ExactIn,
          amountIn: quote.amountInBN,
          minimumAmountOut: quote.minimumAmountOutBN,
        })
      : await meteoraDamm.cpAmm.swap2({
          ...swapParams,
          swapMode: SwapMode.ExactOut,
          amountOut: quote.amountOutBN,
          maximumAmountIn: quote.maximumAmountInBN,
        });

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Re-fetch with retry; a landed-but-failed transaction throws instead of being
  // misreported as confirmed or pending.
  const txData = await solana.getConfirmedTransactionData(signature);

  const result = await solana.handleConfirmation(
    signature,
    txData,
    quote.inputMint.toBase58(),
    quote.outputMint.toBase58(),
    walletAddress,
    side,
    slippagePct,
  );

  return result as ExecuteSwapResponseType;
}

import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { MeteoraConfig } from '../meteora.config';

import { resolveCounterToken, getRawSwapQuote } from './quoteSwap';

const DLMM_PROGRAM_ID = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');

/**
 * DLMM SDK 1.7.5 marks the optional binArrayBitmapExtension account (index 1 of EVERY
 * swap-family instruction: swap/swap2, swapExactOut/2, swapWithPriceImpact/2) read-only,
 * but the deployed program declares it `mut` — so on any pool that HAS a bitmap extension
 * the swap fails on-chain with ConstraintMut (0x7d0, hummingbot/gateway#639). Promote it
 * to writable. When the pool has no extension the SDK passes the DLMM program id as a
 * placeholder, which must stay read-only. The liquidity instructions are unaffected
 * (their IDL entries already say writable).
 */
export function fixSwapBitmapExtensionMeta<T extends { instructions?: { programId: PublicKey; keys: any[] }[] }>(
  tx: T,
): T {
  for (const ix of tx.instructions ?? []) {
    if (ix.programId?.equals?.(DLMM_PROGRAM_ID) && ix.keys?.length > 1 && !ix.keys[1].pubkey.equals(DLMM_PROGRAM_ID)) {
      ix.keys[1].isWritable = true;
    }
  }
  return tx;
}

export async function executeSwap(
  network: string,
  address: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  // Build with the wallet's public key as token authority — works for every wallet type
  // (local, hardware). Signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which knows how to sign for each type.
  const walletPublicKey = new PublicKey(address);

  // Standardized: quote token is derived from the pool given poolAddress + baseToken.
  const quoteToken = await resolveCounterToken(network, poolAddress, baseToken);

  const {
    inputToken,
    outputToken,
    swapAmount,
    quote: swapQuote,
    dlmmPool,
  } = await getRawSwapQuote(network, baseToken, quoteToken, amount, side, poolAddress, slippagePct);

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`);

  const swapTx = fixSwapBitmapExtensionMeta(
    side === 'BUY'
      ? await dlmmPool.swapExactOut({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          outAmount: (swapQuote as SwapQuoteExactOut).outAmount,
          maxInAmount: (swapQuote as SwapQuoteExactOut).maxInAmount,
          lbPair: dlmmPool.pubkey,
          user: walletPublicKey,
          binArraysPubkey: (swapQuote as SwapQuoteExactOut).binArraysPubkey,
        })
      : await dlmmPool.swap({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          inAmount: swapAmount,
          minOutAmount: (swapQuote as SwapQuote).minOutAmount,
          lbPair: dlmmPool.pubkey,
          user: walletPublicKey,
          binArraysPubkey: (swapQuote as SwapQuote).binArraysPubkey,
        }),
  );

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
  // simulates internally).
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(swapTx, address);

  logger.info(`Transaction sent with signature: ${signature}`);

  // Get transaction data for confirmation. The retrying fetch throws the shared
  // landed-but-failed error when the transaction landed with an error, so existence of
  // txData below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  const confirmed = txData !== null;

  // Handle confirmation status
  if (confirmed && txData) {
    // Extract fee from the response
    const txFee = fee;
    // Transaction confirmed, extract balance changes
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [
      inputToken.address,
      outputToken.address,
    ]);

    const inputTokenBalanceChange = balanceChanges[0];
    const outputTokenBalanceChange = balanceChanges[1];

    // Calculate actual amounts swapped
    const amountIn = Math.abs(inputTokenBalanceChange);
    const amountOut = Math.abs(outputTokenBalanceChange);

    // For CLMM swaps, determine base/quote changes based on side
    const baseTokenBalanceChange = side === 'SELL' ? inputTokenBalanceChange : outputTokenBalanceChange;
    const quoteTokenBalanceChange = side === 'SELL' ? outputTokenBalanceChange : inputTokenBalanceChange;

    logger.info(
      `Swap executed successfully: ${amountIn.toFixed(4)} ${inputToken.symbol} -> ${amountOut.toFixed(4)} ${outputToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        tokenIn: inputToken.address,
        tokenOut: outputToken.address,
        amountIn,
        amountOut,
        fee: txFee,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
        slippagePct,
      },
    };
  } else {
    // Transaction not confirmed
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

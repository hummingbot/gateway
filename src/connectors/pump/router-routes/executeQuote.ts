import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { Pump } from '../pump';

import { PumpCachedQuote } from './quoteSwap';

/**
 * Execute a cached pump quote. State is re-fetched fresh, but the instruction
 * amounts and slippage bounds are exactly the cached quote's — curve movement
 * since the quote surfaces as an on-chain slippage failure, not a silent
 * re-price.
 */
export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  const cached = quoteCache.get(quoteId, 'pump') as PumpCachedQuote | null;
  if (!cached) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const solana = await Solana.getInstance(network);
  const pump = await Pump.getInstance(network);
  const walletPk = new PublicKey(walletAddress);

  const baseAmount = new BN(cached.baseAmountRaw);
  const bound = new BN(cached.boundRaw);

  let instructions: TransactionInstruction[];

  if (cached.venue === 'pool') {
    const state = await pump.getSwapState(new PublicKey(cached.poolAddress), walletPk);
    instructions =
      cached.poolInstruction === 'buy'
        ? await pump.ammSdk.buyInstructions(state, baseAmount, bound)
        : await pump.ammSdk.sellInstructions(state, baseAmount, bound);
  } else {
    const mint = new PublicKey(cached.mint);
    const curve = await pump.getCurveState(mint);
    if (curve.graduated) {
      throw httpErrors.badRequest(
        'The bonding curve graduated after this quote was priced. Request a new quote to trade on the PumpSwap pool.',
      );
    }

    const associatedUser = getAssociatedTokenAddressSync(mint, walletPk, true, curve.tokenProgram);
    const associatedUserAccountInfo = await solana.connection.getAccountInfo(associatedUser);

    // Legacy curves are SPL Token and take the v1 instructions; v2 curves are
    // Token-2022 (and may quote in a non-SOL mint) and take the v2 instructions.
    const isV2 = curve.tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
    // slippage 0: the bound below is already the quoted bound, applied verbatim.
    const common = {
      global: curve.global,
      bondingCurveAccountInfo: curve.bondingCurveAccountInfo,
      bondingCurve: curve.bondingCurve,
      mint,
      user: walletPk,
      amount: baseAmount,
      slippage: 0,
      tokenProgram: curve.tokenProgram,
    };

    if (cached.side === 'BUY') {
      instructions = isV2
        ? await pump.sdk.buyV2Instructions({
            ...common,
            associatedUserAccountInfo,
            quoteAmount: bound,
            quoteTokenProgram: TOKEN_PROGRAM_ID,
          })
        : await pump.sdk.buyInstructions({ ...common, associatedUserAccountInfo, solAmount: bound });
    } else {
      instructions = isV2
        ? await pump.sdk.sellV2Instructions({ ...common, quoteAmount: bound, quoteTokenProgram: TOKEN_PROGRAM_ID })
        : await pump.sdk.sellInstructions({
            ...common,
            solAmount: bound,
            mayhemMode: curve.bondingCurve.isMayhemMode,
            cashback: curve.bondingCurve.isCashbackCoin,
          });
    }
  }

  logger.info(
    `Executing pump quote ${quoteId}: ${cached.side} on ${cached.venue} for ` +
      `${cached.tokenIn.symbol} -> ${cached.tokenOut.symbol}`,
  );

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
    cached.tokenIn.address,
    cached.tokenOut.address,
    walletAddress,
    undefined,
    cached.slippagePct,
  );

  if (result.status === 1) {
    quoteCache.delete(quoteId);
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${cached.tokenIn.symbol} -> ` +
        `${result.data?.amountOut.toFixed(4)} ${cached.tokenOut.symbol}`,
    );
  }

  return result as SwapExecuteResponseType;
}

import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { MeteoraDbc } from '../meteora-dbc';

import { DbcCachedQuote } from './quoteSwap';

/**
 * Execute a cached DBC quote. The pool is re-read (a migration since the quote is
 * refused), but the instruction's input and minimum output are exactly the cached
 * quote's, so curve movement surfaces as an on-chain slippage failure, not a silent
 * re-price. The SDK's swap2 wraps SOL when the input is SOL and unwraps after the
 * swap when either side is SOL, so native SOL needs nothing extra here.
 */
export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  const cached = quoteCache.get(quoteId, 'meteora-dbc') as DbcCachedQuote | null;
  if (!cached) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  // The quote was priced on one network's pool; it executes there or not at all.
  if (network !== cached.network) {
    throw httpErrors.badRequest(`Quote ${quoteId} was priced on ${cached.network}, not ${network}`);
  }
  const solana = await Solana.getInstance(cached.network);
  const dbc = await MeteoraDbc.getInstance(cached.network);
  const walletPk = new PublicKey(walletAddress);
  const poolAddress = new PublicKey(cached.poolAddress);

  const state = await dbc.getPool(poolAddress);
  if (state.isMigrated) {
    throw httpErrors.badRequest(
      'The DBC pool migrated to DAMM v2 after this quote was priced. Trade it through the meteora amm connector.',
    );
  }

  const transaction = await dbc.client.pool.swap2({
    owner: walletPk,
    pool: poolAddress,
    swapBaseForQuote: cached.swapBaseForQuote,
    referralTokenAccount: null,
    swapMode: cached.partialFill ? SwapMode.PartialFill : SwapMode.ExactIn,
    amountIn: new BN(cached.amountInRaw),
    minimumAmountOut: new BN(cached.minAmountOutRaw),
  });
  transaction.feePayer = walletPk;

  logger.info(
    `Executing meteora-dbc quote ${quoteId}: ${cached.side} on ${cached.poolAddress} for ` +
      `${cached.tokenIn.symbol} -> ${cached.tokenOut.symbol}`,
  );

  // Sign + send via the wallet-type-aware chokepoint (local/hardware/build mode;
  // simulates and sets blockhash + compute budget internally).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
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

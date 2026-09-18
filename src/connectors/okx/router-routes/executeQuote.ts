import { Solana } from '../../../chains/solana/solana';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { Okx } from '../okx';

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId);
  if (!cached || cached.connector !== 'okx') {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const solana = await Solana.getInstance(network);
  const okx = await Okx.getInstance(network);

  const { inputToken, outputToken, amountRaw, swapMode, slippagePct } = cached;

  // OKX's executable transaction is wallet-bound, so the route is re-fetched here with the
  // executing wallet (fresh route at execution, bounded by slippagePercent). The returned
  // transaction is UNSIGNED and goes through the wallet-type-aware chokepoint (local keypair /
  // Ledger) — no per-wallet-type branching here.
  logger.info(
    `Executing OKX quote ${quoteId} for ${inputToken.symbol} -> ${outputToken.symbol}, slippagePct=${slippagePct}`,
  );
  const { transaction } = await okx.getSwapTransaction(
    walletAddress,
    inputToken.address,
    outputToken.address,
    amountRaw,
    swapMode,
    slippagePct,
  );

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Re-fetch with retry; a landed-but-failed transaction throws instead of being
  // misreported as confirmed or pending.
  const txData = await solana.getConfirmedTransactionData(signature);

  const result = await solana.handleConfirmation(
    signature,
    txData,
    inputToken.address,
    outputToken.address,
    walletAddress,
    undefined,
    slippagePct,
  );

  // Remove quote from cache only after successful execution (confirmed)
  if (result.status === 1) {
    quoteCache.delete(quoteId);
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${inputToken.symbol} -> ${result.data?.amountOut.toFixed(4)} ${outputToken.symbol}`,
    );
  }

  return result as SwapExecuteResponseType;
}

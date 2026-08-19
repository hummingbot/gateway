import { Solana } from '../../../chains/solana/solana';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { DFlow } from '../dflow';

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId);
  if (!cached || cached.connector !== 'dflow') {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const solana = await Solana.getInstance(network);
  const dflow = await DFlow.getInstance(network);

  const { inputToken, outputToken, quoteResponse, slippagePct } = cached;

  // Build the swap UNSIGNED with the wallet as authority, then sign + send via the
  // wallet-type-aware chokepoint (local keypair / Ledger) — no per-wallet-type branching here.
  logger.info(
    `Executing DFlow quote ${quoteId} for ${inputToken.symbol} -> ${outputToken.symbol}, slippageBps=${quoteResponse.slippageBps}`,
  );
  const transaction = await dflow.buildSwapTransactionUnsigned(walletAddress, quoteResponse);

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

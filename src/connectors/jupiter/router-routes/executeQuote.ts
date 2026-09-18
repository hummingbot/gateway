import { Solana } from '../../../chains/solana/solana';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { Jupiter } from '../jupiter';

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const quote = quoteCache.get(quoteId);
  if (!quote) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  // Parse the quote to get token information
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  const inputToken = await solana.getToken(quote.inputMint || quote.inputToken);
  const outputToken = await solana.getToken(quote.outputMint || quote.outputToken);

  if (!inputToken || !outputToken) {
    throw httpErrors.badRequest('Invalid tokens in quote');
  }

  // Build the swap UNSIGNED with the wallet as authority (the same build the Ledger path
  // uses), then sign + send via the wallet-type-aware chokepoint (local keypair / Ledger)
  // — no per-wallet-type branching here.
  logger.info(
    `Executing quote ${quoteId} for ${inputToken.symbol} -> ${outputToken.symbol}, slippageBps=${quote.slippageBps}`,
  );
  const transaction = await jupiter.buildSwapTransactionForHardwareWallet(walletAddress, quote);

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Re-fetch with retry; a landed-but-failed transaction throws instead of being
  // misreported as confirmed or pending.
  const txData = await solana.getConfirmedTransactionData(signature);

  // Handle confirmation status
  const result = await solana.handleConfirmation(
    signature,
    txData,
    inputToken.address,
    outputToken.address,
    walletAddress,
    undefined,
    quote.slippageBps != null ? quote.slippageBps / 100 : undefined,
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

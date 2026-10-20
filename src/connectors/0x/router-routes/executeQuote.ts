import { BigNumber } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { ZeroX } from '../0x';

async function executeQuote(walletAddress: string, network: string, quoteId: string): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote from global cache
  const quote = quoteCache.get(quoteId, '0x');
  if (!quote) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const ethereum = await Ethereum.getInstance(network);
  const zeroX = await ZeroX.getInstance(network);

  logger.info(`Executing quote ${quoteId} on ${network}`);

  // Check allowance for the sell token
  if (quote.sellTokenAddress !== ethereum.nativeTokenSymbol) {
    const sellTokenInfo = await ethereum.getToken(quote.sellTokenAddress);
    if (!sellTokenInfo) {
      throw httpErrors.badRequest(`Token ${quote.sellTokenAddress} not found`);
    }
    await ethereum.requireAllowance(
      walletAddress,
      sellTokenInfo,
      quote.allowanceTarget,
      BigNumber.from(quote.sellAmount),
      quote.allowanceTarget,
    );
  }

  // Execute the swap transaction
  const txResponse = await ethereum.sendTransactionForWallet(walletAddress, {
    to: quote.to,
    data: quote.data,
    value: BigNumber.from(quote.value ?? 0).toString(),
    gasLimit: parseInt(quote.estimatedGas || quote.gas),
    description: `0x swap of ${quote.sellAmount} ${quote.sellTokenAddress} -> ${quote.buyTokenAddress}`,
  });
  const txReceipt = await ethereum.handleTransactionExecution(txResponse);

  // Get token info for formatting amounts
  const sellTokenInfo = await ethereum.getToken(quote.sellTokenAddress);
  const buyTokenInfo = await ethereum.getToken(quote.buyTokenAddress);

  if (!sellTokenInfo || !buyTokenInfo) {
    throw httpErrors.badRequest('Token info not found');
  }

  // Calculate expected amounts from the quote
  const expectedAmountIn = parseFloat(zeroX.formatTokenAmount(quote.sellAmount, sellTokenInfo.decimals));
  const expectedAmountOut = parseFloat(zeroX.formatTokenAmount(quote.buyAmount, buyTokenInfo.decimals));

  // Use the new handleExecuteQuoteTransactionConfirmation helper
  const result = ethereum.handleExecuteQuoteTransactionConfirmation(
    txReceipt,
    quote.sellTokenAddress,
    quote.buyTokenAddress,
    expectedAmountIn,
    expectedAmountOut,
    undefined,
    txResponse.hash,
    quoteCache.getRequest(quoteId, '0x')?.slippagePct,
  );

  // Handle different transaction states
  if (result.status === -1) {
    // Transaction failed
    throw httpErrors.internalServerError('Transaction failed on-chain');
  }

  if (result.status === 0) {
    // Transaction is still pending
    logger.info(`Transaction ${result.signature || 'pending'} is still pending`);
    return result;
  }

  // Transaction confirmed (status === 1)
  logger.info(
    `Swap executed successfully: ${expectedAmountIn.toFixed(4)} ${sellTokenInfo.symbol} -> ${expectedAmountOut.toFixed(4)} ${buyTokenInfo.symbol}`,
  );

  // Remove quote from cache only after successful execution (confirmed)
  quoteCache.delete(quoteId);

  return result;
}

export { executeQuote };

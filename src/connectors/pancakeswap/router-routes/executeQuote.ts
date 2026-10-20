import { BigNumber } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { rethrowIfCaptured } from '../../../chains/ethereum/evm-build-mode';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';

async function executeQuote(walletAddress: string, network: string, quoteId: string): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId, 'pancakeswap');
  if (!cached) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const { quote, request } = cached;
  const { inputToken, outputToken, side, amount, slippagePct } = request;

  const ethereum = await Ethereum.getInstance(network);

  logger.info(`Executing quote ${quoteId} for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`);

  // The PancakeSwap Universal Router spends the token directly (plain ERC-20 allowance).
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    await ethereum.requireAllowance(
      walletAddress,
      inputToken,
      quote.methodParameters.to,
      BigNumber.from(quote.trade.inputAmount.quotient.toString()),
      'pancakeswap/router',
    );
  }

  // Execute the swap transaction
  let txReceipt: Awaited<ReturnType<typeof ethereum.handleTransactionExecution>> = null;
  let txHash: string | undefined;

  try {
    const txResponse = await ethereum.sendTransactionForWallet(walletAddress, {
      to: quote.methodParameters.to,
      data: quote.methodParameters.calldata,
      value: BigNumber.from(quote.methodParameters.value).toString(),
      // PancakeSwap Universal Router swaps typically use between 200k-500k gas
      gasLimit: 500000,
      description: `PancakeSwap swap of ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
    });
    txHash = txResponse.hash;
    txReceipt = await ethereum.handleTransactionExecution(txResponse);
    if (txReceipt) {
      logger.info(`Transaction hash: ${txReceipt.transactionHash}`);
      logger.info(`Gas used: ${txReceipt.gasUsed?.toString() || 'unknown'}`);
    }
  } catch (error) {
    rethrowIfCaptured(error);
    logger.error(`Swap execution error: ${error.message}`);
    if (error.statusCode) {
      throw error;
    }
    throw httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
  }

  // Calculate expected amounts from the trade
  const expectedAmountIn = parseFloat(quote.trade.inputAmount.toExact());
  const expectedAmountOut = parseFloat(quote.trade.outputAmount.toExact());

  // Use the new handleExecuteQuoteTransactionConfirmation helper
  const result = ethereum.handleExecuteQuoteTransactionConfirmation(
    txReceipt,
    inputToken.address,
    outputToken.address,
    expectedAmountIn,
    expectedAmountOut,
    side,
    txHash,
    slippagePct,
  );

  // Handle different transaction states
  if (result.status === -1) {
    // Transaction failed
    logger.error(`Transaction failed on-chain. Receipt: ${JSON.stringify(txReceipt)}`);
    throw httpErrors.internalServerError(
      'Transaction reverted on-chain. This could be due to slippage, expired quote, insufficient funds, or other blockchain issues.',
    );
  }

  if (result.status === 0) {
    // Transaction is still pending
    logger.info(`Transaction ${result.signature || 'pending'} is still pending`);
    return result;
  }

  // Transaction confirmed (status === 1)
  logger.info(
    `Swap executed successfully: ${expectedAmountIn} ${inputToken.symbol} -> ${expectedAmountOut} ${outputToken.symbol}`,
  );

  // Remove quote from cache only after successful execution (confirmed)
  quoteCache.delete(quoteId);

  return result;
}

export { executeQuote };

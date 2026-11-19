import { BigNumber } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { rethrowIfCaptured } from '../../../chains/ethereum/evm-build-mode';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';

async function executeQuote(walletAddress: string, network: string, quoteId: string): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId, 'uniswap');
  if (!cached) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const { quote, request } = cached;
  const { inputToken, outputToken, side, amount, slippagePct } = request;

  const ethereum = await Ethereum.getInstance(network);

  logger.info(`Executing quote ${quoteId} for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`);

  // Universal Router V2 spends through Permit2: token -> Permit2, then Permit2 -> router.
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    await ethereum.requirePermit2Allowance(
      walletAddress,
      inputToken,
      quote.methodParameters.to,
      BigNumber.from(quote.trade.inputAmount.quotient.toString()),
      'uniswap/router',
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
      // Universal Router V2 swaps typically use between 200k-500k gas
      gasLimit: 500000,
      description: `Uniswap swap of ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
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

    // Decode Universal Router error data for better diagnostics
    const errorData: string = error.error?.data ?? '';
    const errorSelector = errorData.substring(0, 10);
    if (errorSelector === '0xd81b2f2e') {
      // AllowanceExpired error from Permit2
      throw httpErrors.badRequest(
        `Universal Router error: Permit2 allowance has expired for ${inputToken.symbol}. ` +
          `Please re-approve the token using spender: "uniswap/router" to set a new expiration.`,
      );
    } else if (errorSelector === '0x39d35496' || errorData.includes('TooLittleReceived')) {
      throw httpErrors.badRequest(
        `Swap failed: Slippage tolerance exceeded. The output amount would be less than your minimum acceptable amount. ` +
          `Try increasing slippage tolerance or request a new quote.`,
      );
    } else if (errorSelector === '0x963b34a5' || errorData.includes('TooMuchInputPaid')) {
      throw httpErrors.badRequest(
        `Swap failed: Slippage tolerance exceeded. The input amount would be more than your maximum acceptable amount. ` +
          `Try increasing slippage tolerance or request a new quote.`,
      );
    }

    if (error.statusCode) {
      throw error;
    }
    throw httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
  }

  // Calculate expected amounts from the trade
  const expectedAmountIn = parseFloat(quote.trade.inputAmount.toExact());
  const expectedAmountOut = parseFloat(quote.trade.outputAmount.toExact());

  // Use the new handleExecuteQuoteTransactionConfirmation helper
  // Pass txHash for pending transactions (when txReceipt is null)
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
  // Status codes: 1 = CONFIRMED, 0 = PENDING, -1 = FAILED
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

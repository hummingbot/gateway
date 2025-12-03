import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { ZeroX } from '../0x';
import { ZeroXExecuteQuoteRequest } from '../schemas';

async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
  gasPrice?: string,
  maxGas?: number,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote from global cache
  const quote = quoteCache.get(quoteId);
  if (!quote) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  const zeroX = await ZeroX.getInstance(network);

  logger.info(`Executing quote ${quoteId} on ${network}`);

  // Check allowance for the sell token
  if (quote.sellTokenAddress !== ethereum.nativeTokenSymbol) {
    const sellTokenInfo = await ethereum.getToken(quote.sellTokenAddress);
    if (!sellTokenInfo) {
      throw httpErrors.badRequest(`Token ${quote.sellTokenAddress} not found`);
    }

    const tokenContract = ethereum.getContract(quote.sellTokenAddress, wallet);
    const allowance = await ethereum.getERC20Allowance(
      tokenContract,
      wallet,
      quote.allowanceTarget,
      sellTokenInfo.decimals,
    );

    const requiredAllowance = BigNumber.from(quote.sellAmount);
    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      throw httpErrors.badRequest(
        `Insufficient allowance for ${sellTokenInfo.symbol}. Required: ${zeroX.formatTokenAmount(quote.sellAmount, sellTokenInfo.decimals)}, Current: ${zeroX.formatTokenAmount(allowance.value.toString(), sellTokenInfo.decimals)}`,
      );
    }
  }

  // Execute the swap transaction
  const txData = {
    to: quote.to,
    data: quote.data,
    value: quote.value,
    gasLimit: maxGas || parseInt(quote.estimatedGas || quote.gas),
    ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
  };

  const txResponse = await wallet.sendTransaction(txData);
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

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteQuoteRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched quote from 0x',
        tags: ['/connector/0x'],
        body: ZeroXExecuteQuoteRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, quoteId, gasPrice, maxGas } =
          request.body as typeof ZeroXExecuteQuoteRequest._type;

        return await executeQuote(walletAddress, network, quoteId, gasPrice, maxGas);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing 0x quote:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

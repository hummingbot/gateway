import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { Fibrous, FIBROUS_NATIVE_TOKEN_ADDRESS } from '../fibrous';
import { FibrousExecuteQuoteRequest } from '../schemas';

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
  const fibrous = await Fibrous.getInstance(network);

  logger.info(`Executing Fibrous quote ${quoteId} on ${network}`);

  const { tokenIn, tokenOut } = quote;

  // ERC-20 inputs must have approved the router before the swap can settle.
  const isNativeInput = tokenIn.address.toLowerCase() === FIBROUS_NATIVE_TOKEN_ADDRESS;
  if (!isNativeInput) {
    const tokenContract = ethereum.getContract(tokenIn.address, wallet);
    const allowance = await ethereum.getERC20Allowance(tokenContract, wallet, quote.routerAddress, tokenIn.decimals);

    const requiredAllowance = BigNumber.from(quote.amountIn);
    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      throw httpErrors.badRequest(
        `Insufficient allowance for ${tokenIn.symbol}. Required: ${fibrous.formatTokenAmount(quote.amountIn, tokenIn.decimals)}, Current: ${fibrous.formatTokenAmount(allowance.value.toString(), tokenIn.decimals)}`,
      );
    }
  }

  // Execute the swap transaction
  const txData = {
    to: quote.to,
    data: quote.data,
    value: BigNumber.from(quote.value),
    gasLimit: maxGas || parseInt(quote.gasEstimate),
    ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
  };

  const txResponse = await wallet.sendTransaction(txData);
  const txReceipt = await ethereum.handleTransactionExecution(txResponse);

  const result = ethereum.handleExecuteQuoteTransactionConfirmation(
    txReceipt,
    tokenIn.address,
    tokenOut.address,
    quote.expectedAmountIn,
    quote.expectedAmountOut,
  );

  // Handle different transaction states
  if (result.status === -1) {
    throw httpErrors.internalServerError('Transaction failed on-chain');
  }

  if (result.status === 0) {
    logger.info(`Transaction ${result.signature || 'pending'} is still pending`);
    return result;
  }

  // Transaction confirmed (status === 1)
  logger.info(
    `Swap executed successfully: ${quote.expectedAmountIn.toFixed(4)} ${tokenIn.symbol} -> ${quote.expectedAmountOut.toFixed(4)} ${tokenOut.symbol}`,
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
        description: 'Execute a previously fetched quote from Fibrous',
        tags: ['/connector/fibrous'],
        body: FibrousExecuteQuoteRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, quoteId, gasPrice, maxGas } =
          request.body as typeof FibrousExecuteQuoteRequest._type;

        return await executeQuote(walletAddress, network, quoteId, gasPrice, maxGas);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing Fibrous quote:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

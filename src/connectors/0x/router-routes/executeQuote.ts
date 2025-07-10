import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { ZeroX } from '../0x';
import { ZeroXExecuteQuoteRequest } from '../schemas';

async function executeQuote(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  quoteId: string,
  gasPrice?: string,
  maxGas?: number,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote from global cache
  const quote = quoteCache.get(quoteId);
  if (!quote) {
    throw fastify.httpErrors.badRequest('Quote not found or expired');
  }

  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  const zeroX = await ZeroX.getInstance(network);

  logger.info(`Executing quote ${quoteId} on ${network}`);

  // Check allowance for the sell token
  if (quote.sellTokenAddress !== ethereum.nativeTokenSymbol) {
    const sellTokenInfo = ethereum.getToken(quote.sellTokenAddress);
    if (!sellTokenInfo) {
      throw fastify.httpErrors.badRequest(`Token ${quote.sellTokenAddress} not found`);
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
      throw fastify.httpErrors.badRequest(
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
  const txReceipt = await txResponse.wait();

  if (!txReceipt || txReceipt.status !== 1) {
    throw fastify.httpErrors.internalServerError('Transaction failed');
  }

  // Calculate fee from gas used
  const fee = parseFloat(zeroX.formatTokenAmount(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString(), 18));

  // For now, use the quote amounts as the actual amounts
  // Get token info for formatting amounts
  const sellTokenInfo = ethereum.getToken(quote.sellTokenAddress);
  const buyTokenInfo = ethereum.getToken(quote.buyTokenAddress);

  if (!sellTokenInfo || !buyTokenInfo) {
    throw fastify.httpErrors.badRequest('Token info not found');
  }

  // Calculate actual amounts from the quote
  const amountIn = parseFloat(zeroX.formatTokenAmount(quote.sellAmount, sellTokenInfo.decimals));
  const amountOut = parseFloat(zeroX.formatTokenAmount(quote.buyAmount, buyTokenInfo.decimals));

  logger.info(
    `Swap executed successfully: ${amountIn.toFixed(4)} ${sellTokenInfo.symbol} -> ${amountOut.toFixed(4)} ${buyTokenInfo.symbol}`,
  );

  // Remove quote from cache only after successful execution (confirmed)
  quoteCache.delete(quoteId);

  // For 0x quotes, we don't know the original side, so we'll set balance changes to 0
  // The actual balance changes would need to be tracked from the original request
  const baseTokenBalanceChange = 0;
  const quoteTokenBalanceChange = 0;

  return {
    signature: txReceipt.transactionHash,
    status: 1, // CONFIRMED
    data: {
      tokenIn: quote.sellTokenAddress,
      tokenOut: quote.buyTokenAddress,
      amountIn,
      amountOut,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
    },
  };
}

export { executeQuote };

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

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

        return await executeQuote(fastify, walletAddress, network, quoteId, gasPrice, maxGas);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing quote:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

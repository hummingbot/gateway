import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { UniswapExecuteQuoteRequest } from '../schemas';
import { Uniswap } from '../uniswap';

async function executeQuote(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  quoteId: string,
  gasPrice?: string,
  maxGas?: number,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId);
  if (!cached) {
    throw fastify.httpErrors.badRequest('Quote not found or expired');
  }

  const { quote, request } = cached;
  const { quoteTokenInfo, inputToken, outputToken, side, amount } = request;

  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  const uniswap = await Uniswap.getInstance(network);

  logger.info(`Executing quote ${quoteId} for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`);

  // Check and approve allowance if needed
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    const tokenContract = ethereum.getContract(inputToken.address, wallet);
    const spender = quote.methodParameters.to; // Router address
    const allowance = await ethereum.getERC20Allowance(tokenContract, wallet, spender, inputToken.decimals);

    // Calculate required allowance from the trade input amount
    const requiredAllowance = BigNumber.from(quote.trade.inputAmount.quotient.toString());

    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      logger.info(`Approving ${inputToken.symbol} for Universal Router`);
      await ethereum.approveERC20(tokenContract, wallet, spender, requiredAllowance);
    }
  }

  // Execute the swap transaction
  const txData = {
    to: quote.methodParameters.to,
    data: quote.methodParameters.calldata,
    value: quote.methodParameters.value,
    gasLimit: maxGas || parseInt(quote.estimatedGasUsed.toString()),
    ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
  };

  const txResponse = await wallet.sendTransaction(txData);
  const txReceipt = await txResponse.wait();

  if (!txReceipt || txReceipt.status !== 1) {
    throw fastify.httpErrors.internalServerError('Transaction failed');
  }

  // Calculate fee from gas used
  const fee = parseFloat(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString()) / 1e18;

  // Calculate actual amounts from the trade
  const amountIn = parseFloat(quote.trade.inputAmount.toExact());
  const amountOut = parseFloat(quote.trade.outputAmount.toExact());

  const baseTokenBalanceChange = side === 'SELL' ? -amountIn : amountOut;
  const quoteTokenBalanceChange = side === 'SELL' ? amountOut : -amountIn;

  logger.info(`Swap executed successfully: ${amountIn} ${inputToken.symbol} -> ${amountOut} ${outputToken.symbol}`);

  // Remove quote from cache only after successful execution (confirmed)
  quoteCache.delete(quoteId);

  return {
    signature: txReceipt.transactionHash,
    status: 1, // CONFIRMED
    data: {
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
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
        description: 'Execute a previously fetched quote from Uniswap Universal Router',
        tags: ['/connector/uniswap'],
        body: {
          ...UniswapExecuteQuoteRequest,
          properties: {
            ...UniswapExecuteQuoteRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'mainnet' },
            quoteId: {
              type: 'string',
              examples: ['123e4567-e89b-12d3-a456-426614174000'],
            },
          },
        },
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, quoteId, gasPrice, maxGas } =
          request.body as typeof UniswapExecuteQuoteRequest._type;

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

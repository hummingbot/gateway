import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { ZeroX } from '../0x';
import { ZeroXExecuteQuoteRequest } from '../schemas';

import { quoteCache } from './quoteSwap';

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
  const { sellToken, buyToken, side, amount, baseTokenInfo, quoteTokenInfo } = request;

  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  const zeroX = await ZeroX.getInstance(network);

  logger.info(
    `Executing quote ${quoteId} for ${amount} ${side === 'SELL' ? baseTokenInfo.symbol : quoteTokenInfo.symbol} -> ${side === 'SELL' ? quoteTokenInfo.symbol : baseTokenInfo.symbol}`,
  );

  // Check and approve allowance if needed
  const sellTokenInfo = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  if (sellTokenInfo.address !== ethereum.nativeTokenSymbol) {
    const tokenContract = ethereum.getContract(sellTokenInfo.address, wallet);
    const allowance = await ethereum.getERC20Allowance(
      tokenContract,
      wallet,
      quote.allowanceTarget,
      sellTokenInfo.decimals,
    );

    const requiredAllowance = BigNumber.from(quote.sellAmount);
    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      logger.info(`Approving ${sellTokenInfo.symbol} for 0x swap`);
      await ethereum.approveERC20(tokenContract, wallet, quote.allowanceTarget, requiredAllowance);
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
  // In a real implementation, you would extract actual amounts from events
  const baseTokenBalanceChange =
    side === 'SELL'
      ? -parseFloat(zeroX.formatTokenAmount(quote.sellAmount, baseTokenInfo.decimals))
      : parseFloat(zeroX.formatTokenAmount(quote.buyAmount, baseTokenInfo.decimals));
  const quoteTokenBalanceChange =
    side === 'SELL'
      ? parseFloat(zeroX.formatTokenAmount(quote.buyAmount, quoteTokenInfo.decimals))
      : -parseFloat(zeroX.formatTokenAmount(quote.sellAmount, quoteTokenInfo.decimals));

  // Calculate actual amounts swapped
  const amountIn = side === 'SELL' ? Math.abs(baseTokenBalanceChange) : Math.abs(quoteTokenBalanceChange);
  const amountOut = side === 'SELL' ? Math.abs(quoteTokenBalanceChange) : Math.abs(baseTokenBalanceChange);

  logger.info(
    `Swap executed successfully: ${amountIn.toFixed(4)} ${side === 'SELL' ? baseTokenInfo.symbol : quoteTokenInfo.symbol} -> ${amountOut.toFixed(4)} ${side === 'SELL' ? quoteTokenInfo.symbol : baseTokenInfo.symbol}`,
  );

  // Remove quote from cache only after successful execution (confirmed)
  quoteCache.delete(quoteId);

  return {
    signature: txReceipt.transactionHash,
    status: 1, // CONFIRMED
    data: {
      tokenIn: sellToken,
      tokenOut: buyToken,
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
        body: {
          ...ZeroXExecuteQuoteRequest,
          properties: {
            ...ZeroXExecuteQuoteRequest.properties,
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

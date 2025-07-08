import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ExecuteQuoteRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
} from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { UniswapExecuteQuoteRequest } from '../schemas';
import { Uniswap } from '../uniswap';

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
  const {
    baseTokenInfo,
    quoteTokenInfo,
    inputToken,
    outputToken,
    side,
    amount,
  } = request;

  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  const uniswap = await Uniswap.getInstance(network);

  logger.info(
    `Executing quote ${quoteId} for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Check and approve allowance if needed
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    const tokenContract = ethereum.getContract(inputToken.address, wallet);
    const spender = quote.methodParameters.to; // Router address
    const allowance = await ethereum.getERC20Allowance(
      tokenContract,
      wallet,
      spender,
      inputToken.decimals,
    );

    // Calculate required allowance based on side
    const requiredAmount =
      side === 'SELL'
        ? amount
        : quote.quote
          ? parseFloat(quote.quote.toExact())
          : 0;
    const scaleFactor = Math.pow(10, inputToken.decimals);
    const requiredAllowance = BigNumber.from(
      Math.floor(requiredAmount * scaleFactor).toString(),
    );

    if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
      logger.info(`Approving ${inputToken.symbol} for Uniswap router`);
      await ethereum.approveERC20(
        tokenContract,
        wallet,
        spender,
        requiredAllowance,
      );
    }
  }

  // Execute the swap transaction
  const txData = {
    to: quote.methodParameters.to,
    data: quote.methodParameters.calldata,
    value: quote.methodParameters.value,
    gasLimit:
      maxGas || parseInt(quote.estimatedGasUsed?.toString() || '500000'),
    ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
  };

  const txResponse = await wallet.sendTransaction(txData);
  const txReceipt = await txResponse.wait();

  if (!txReceipt || txReceipt.status !== 1) {
    throw fastify.httpErrors.internalServerError('Transaction failed');
  }

  // Calculate fee from gas used
  const fee =
    parseFloat(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice).toString()) /
    1e18;

  // Calculate actual amounts (for now use quote amounts)
  const baseTokenBalanceChange =
    side === 'SELL'
      ? -amount
      : quote.quote
        ? parseFloat(quote.quote.toExact())
        : 0;
  const quoteTokenBalanceChange =
    side === 'SELL'
      ? quote.quote
        ? parseFloat(quote.quote.toExact())
        : 0
      : -amount;

  const totalInputSwapped = Math.abs(
    side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange,
  );
  const totalOutputSwapped = Math.abs(
    side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange,
  );

  logger.info(
    `Swap executed successfully: ${totalInputSwapped} ${inputToken.symbol} -> ${totalOutputSwapped} ${outputToken.symbol}`,
  );

  // Remove quote from cache after successful execution
  quoteCache.delete(quoteId);

  return {
    signature: txReceipt.transactionHash,
    status: 1, // CONFIRMED
    data: {
      totalInputSwapped,
      totalOutputSwapped,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      tokenInAmount: totalInputSwapped,
      tokenOutAmount: totalOutputSwapped,
    },
  };
}

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteQuoteRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched quote from Uniswap',
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

        return await executeQuote(
          fastify,
          walletAddress,
          network,
          quoteId,
          gasPrice,
          maxGas,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing quote:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

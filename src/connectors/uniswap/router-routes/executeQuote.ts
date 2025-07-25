import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { waitForTransactionWithTimeout } from '../../../chains/ethereum/ethereum.utils';
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
  const uniswap = await Uniswap.getInstance(network);

  // Check if this is a hardware wallet
  const isHardwareWallet = await ethereum.isHardwareWallet(walletAddress);

  logger.info(
    `Executing quote ${quoteId} for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}${isHardwareWallet ? ' with hardware wallet' : ''}`,
  );

  // Check and approve allowance if needed
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    const spender = quote.methodParameters.to; // Router address

    if (isHardwareWallet) {
      // Hardware wallet flow for checking allowance
      const tokenContract = ethereum.getContract(inputToken.address, ethereum.provider);
      const allowance = await tokenContract.allowance(walletAddress, spender);
      const requiredAllowance = BigNumber.from(quote.trade.inputAmount.quotient.toString());

      if (allowance.lt(requiredAllowance)) {
        logger.info(`Hardware wallet detected. Building approve transaction for ${inputToken.symbol}`);

        const ledger = new EthereumLedger();
        const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

        // Build the approve transaction data
        const iface = new utils.Interface(['function approve(address spender, uint256 amount)']);
        const data = iface.encodeFunctionData('approve', [spender, requiredAllowance]);

        // Build unsigned transaction
        const unsignedTx = {
          to: inputToken.address,
          data: data,
          nonce: nonce,
          chainId: ethereum.chainId,
          gasLimit: BigNumber.from('100000'), // Standard gas limit for approve
        };

        // Sign with Ledger
        const signedTx = await ledger.signTransaction(walletAddress, unsignedTx as any);

        // Send the signed transaction
        const txResponse = await ethereum.provider.sendTransaction(signedTx);

        // Wait for confirmation
        await waitForTransactionWithTimeout(txResponse);
        logger.info(`Approval transaction confirmed for ${inputToken.symbol}`);
      }
    } else {
      // Regular wallet flow
      const wallet = await ethereum.getWallet(walletAddress);
      const tokenContract = ethereum.getContract(inputToken.address, wallet);
      const allowance = await ethereum.getERC20Allowance(tokenContract, wallet, spender, inputToken.decimals);

      // Calculate required allowance from the trade input amount
      const requiredAllowance = BigNumber.from(quote.trade.inputAmount.quotient.toString());

      if (BigNumber.from(allowance.value).lt(requiredAllowance)) {
        logger.info(`Approving ${inputToken.symbol} for Universal Router`);
        await ethereum.approveERC20(tokenContract, wallet, spender, requiredAllowance);
      }
    }
  }

  // Execute the swap transaction
  let txReceipt;

  if (isHardwareWallet) {
    // Hardware wallet flow
    logger.info('Hardware wallet detected. Building swap transaction for Ledger signing.');

    const ledger = new EthereumLedger();
    const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

    // Build unsigned transaction
    const unsignedTx = {
      to: quote.methodParameters.to,
      data: quote.methodParameters.calldata,
      value: quote.methodParameters.value,
      nonce: nonce,
      chainId: ethereum.chainId,
      gasLimit: maxGas || parseInt(quote.estimatedGasUsed.toString()),
      ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
    };

    // Sign with Ledger
    const signedTx = await ledger.signTransaction(walletAddress, unsignedTx as any);

    // Send the signed transaction
    const txResponse = await ethereum.provider.sendTransaction(signedTx);
    txReceipt = await waitForTransactionWithTimeout(txResponse);
  } else {
    // Regular wallet flow
    const wallet = await ethereum.getWallet(walletAddress);
    const txData = {
      to: quote.methodParameters.to,
      data: quote.methodParameters.calldata,
      value: quote.methodParameters.value,
      gasLimit: maxGas || parseInt(quote.estimatedGasUsed.toString()),
      ...(gasPrice && { gasPrice: BigNumber.from(gasPrice) }),
    };

    const txResponse = await wallet.sendTransaction(txData);
    txReceipt = await waitForTransactionWithTimeout(txResponse);
  }

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
  fastify.post<{
    Body: ExecuteQuoteRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched quote from Uniswap Universal Router',
        tags: ['/connector/uniswap'],
        body: UniswapExecuteQuoteRequest,
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
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

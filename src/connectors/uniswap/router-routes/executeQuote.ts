import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { waitForTransactionWithTimeout } from '../../../chains/ethereum/ethereum.utils';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { UniswapExecuteQuoteRequest } from '../schemas';

async function executeQuote(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId);
  if (!cached) {
    throw fastify.httpErrors.badRequest('Quote not found or expired');
  }

  const { quote, request } = cached;
  const { inputToken, outputToken, side, amount } = request;

  const ethereum = await Ethereum.getInstance(network);

  // Check if this is a hardware wallet
  const isHardwareWallet = await ethereum.isHardwareWallet(walletAddress);

  logger.info(
    `Executing quote ${quoteId} for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}${isHardwareWallet ? ' with hardware wallet' : ''}`,
  );

  // Check and approve allowance if needed
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    const spender = quote.methodParameters.to; // Router address
    const requiredAllowance = BigNumber.from(quote.trade.inputAmount.quotient.toString());

    // Use provider for both hardware and regular wallets to check allowance
    const tokenContract = ethereum.getContract(inputToken.address, ethereum.provider);
    const allowance = await tokenContract.allowance(walletAddress, spender);

    if (BigNumber.from(allowance).lt(requiredAllowance)) {
      if (isHardwareWallet) {
        // Hardware wallet flow for approval
        logger.info(`Hardware wallet detected. Building approve transaction for ${inputToken.symbol}`);

        const ledger = new EthereumLedger();
        const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

        // Build the approve transaction data
        const iface = new utils.Interface(['function approve(address spender, uint256 amount)']);
        const data = iface.encodeFunctionData('approve', [spender, requiredAllowance]);

        // Get gas options using estimateGasPrice
        const gasOptions = await ethereum.prepareGasOptions();

        // Build unsigned transaction with gas parameters
        const unsignedTx = {
          to: inputToken.address,
          data: data,
          nonce: nonce,
          chainId: ethereum.chainId,
          ...gasOptions, // Include gas parameters from prepareGasOptions
        };

        // Sign with Ledger
        const signedTx = await ledger.signTransaction(walletAddress, unsignedTx as any);

        // Send the signed transaction
        const txResponse = await ethereum.provider.sendTransaction(signedTx);

        // Wait for confirmation
        await waitForTransactionWithTimeout(txResponse);
        logger.info(`Approval transaction confirmed for ${inputToken.symbol}`);
      } else {
        // Regular wallet flow for approval
        const wallet = await ethereum.getWallet(walletAddress);
        const tokenContractWithSigner = ethereum.getContract(inputToken.address, wallet);
        logger.info(`Approving ${inputToken.symbol} for Universal Router`);
        await ethereum.approveERC20(tokenContractWithSigner, wallet, spender, requiredAllowance);
      }
    }
  }

  // Execute the swap transaction
  let txReceipt;

  try {
    if (isHardwareWallet) {
      // Hardware wallet flow
      logger.info('Hardware wallet detected. Building swap transaction for Ledger signing.');

      const ledger = new EthereumLedger();
      const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

      // Get gas options using estimateGasPrice
      const gasOptions = await ethereum.prepareGasOptions();

      // Always use a fixed gas limit to avoid estimation issues
      const gasLimit = BigNumber.from(400000); // Use 400k to be safe

      // Build unsigned transaction with gas parameters
      const unsignedTx = {
        to: quote.methodParameters.to,
        data: quote.methodParameters.calldata,
        value: quote.methodParameters.value,
        nonce: nonce,
        chainId: ethereum.chainId,
        gasLimit: gasLimit,
        ...gasOptions, // Include gas parameters from prepareGasOptions
      };

      // Sign with Ledger
      const signedTx = await ledger.signTransaction(walletAddress, unsignedTx as any);

      // Send the signed transaction
      const txResponse = await ethereum.provider.sendTransaction(signedTx);

      // Wait for confirmation with timeout (30 seconds for hardware wallets)
      txReceipt = await waitForTransactionWithTimeout(txResponse, 30000);
    } else {
      // Regular wallet flow
      let wallet;
      try {
        wallet = await ethereum.getWallet(walletAddress);
      } catch (err) {
        logger.error(`Failed to load wallet: ${err.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
      }

      // Get gas options using estimateGasPrice
      const gasOptions = await ethereum.prepareGasOptions();

      // Always use a fixed gas limit to avoid estimation issues
      // Uniswap Universal Router swaps typically use between 200k-400k gas
      const gasLimit = BigNumber.from(400000); // Use 400k to be safe
      logger.info(`Using fixed gas limit: ${gasLimit.toString()}`);

      // Build transaction parameters with gas options
      const txData = {
        to: quote.methodParameters.to,
        data: quote.methodParameters.calldata,
        value: quote.methodParameters.value,
        nonce: await ethereum.provider.getTransactionCount(walletAddress, 'latest'),
        gasLimit: gasLimit,
        ...gasOptions, // Include gas parameters from prepareGasOptions
      };

      logger.info(`Using gas options: ${JSON.stringify({ ...gasOptions, gasLimit: gasLimit.toString() })}`);

      // Send transaction directly without relying on ethers' automatic gas estimation
      const txResponse = await wallet.sendTransaction(txData);
      logger.info(`Transaction sent: ${txResponse.hash}`);

      // Wait for transaction confirmation
      txReceipt = await txResponse.wait();
    }

    // Check if the transaction was successful
    if (!txReceipt || txReceipt.status === 0) {
      logger.error(`Transaction failed on-chain. Receipt: ${JSON.stringify(txReceipt)}`);
      throw fastify.httpErrors.internalServerError(
        'Transaction reverted on-chain. This could be due to slippage, expired quote, insufficient funds, or other blockchain issues.',
      );
    }

    logger.info(`Transaction confirmed: ${txReceipt.transactionHash}`);
    logger.info(`Gas used: ${txReceipt.gasUsed.toString()}`);
  } catch (error) {
    logger.error(`Swap execution error: ${error.message}`);
    if (error.transaction) {
      logger.debug(`Transaction details: ${JSON.stringify(error.transaction)}`);
    }
    if (error.receipt) {
      logger.debug(`Transaction receipt: ${JSON.stringify(error.receipt)}`);
    }

    // Handle specific error cases
    if (error.message && error.message.includes('insufficient funds')) {
      throw fastify.httpErrors.badRequest(
        'Insufficient funds for transaction. Please ensure you have enough ETH to cover gas costs.',
      );
    } else if (error.message && error.message.includes('cannot estimate gas')) {
      throw fastify.httpErrors.badRequest(
        'Transaction would fail. This could be due to an expired quote, insufficient token balance, or market conditions have changed. Please request a new quote.',
      );
    } else if (error.message.includes('rejected on Ledger')) {
      throw fastify.httpErrors.badRequest('Transaction rejected on Ledger device');
    } else if (error.message.includes('Ledger device is locked')) {
      throw fastify.httpErrors.badRequest(error.message);
    } else if (error.message.includes('Wrong app is open')) {
      throw fastify.httpErrors.badRequest(error.message);
    }

    // Re-throw if already a fastify error
    if (error.statusCode) {
      throw error;
    }

    throw fastify.httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
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
        const {
          walletAddress = getEthereumChainConfig().defaultWallet,
          network = getEthereumChainConfig().defaultNetwork,
          quoteId,
        } = request.body as typeof UniswapExecuteQuoteRequest._type;

        return await executeQuote(fastify, walletAddress, network, quoteId);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing quote:', e);
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

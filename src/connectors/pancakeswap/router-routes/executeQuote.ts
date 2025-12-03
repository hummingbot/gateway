import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { PancakeswapExecuteQuoteRequest } from '../schemas';

async function executeQuote(walletAddress: string, network: string, quoteId: string): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId);
  if (!cached) {
    throw httpErrors.badRequest('Quote not found or expired');
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
    const requiredAllowance = BigNumber.from(quote.trade.inputAmount.quotient.toString());
    const universalRouterAddress = quote.methodParameters.to;

    // Step 1: Check token allowance
    logger.info(`Checking ${inputToken.symbol} allowance`);
    const tokenContract = ethereum.getContract(inputToken.address, ethereum.provider);
    const tokenAllowance = await tokenContract.allowance(walletAddress, universalRouterAddress);

    if (BigNumber.from(tokenAllowance).lt(requiredAllowance)) {
      const inputAmount = utils.formatUnits(requiredAllowance, inputToken.decimals);
      const currentAllowance = utils.formatUnits(tokenAllowance, inputToken.decimals);

      throw httpErrors.badRequest(
        `Insufficient ${inputToken.symbol} allowance to ${universalRouterAddress}. ` +
          `Required: ${inputAmount}, Current: ${currentAllowance}. ` +
          `Please approve ${inputToken.symbol} using spender: "pancakeswap/router"`,
      );
    }

    logger.info(`Allowance confirmed: Token->UniversalRouter`);
  }

  // Execute the swap transaction
  let txReceipt;

  try {
    if (isHardwareWallet) {
      // Hardware wallet flow
      logger.info('Hardware wallet detected. Building swap transaction for Ledger signing.');

      const ledger = new EthereumLedger();
      const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

      // Get gas options with increased gas limit for Universal Router V2
      const gasLimit = 500000; // Increased for Universal Router V2
      const gasOptions = await ethereum.prepareGasOptions(undefined, gasLimit);

      // Build unsigned transaction with gas parameters
      const unsignedTx = {
        to: quote.methodParameters.to,
        data: quote.methodParameters.calldata,
        value: quote.methodParameters.value,
        nonce: nonce,
        chainId: ethereum.chainId,
        ...gasOptions, // Include gas parameters from prepareGasOptions (includes gasLimit)
      };

      // Sign with Ledger
      const signedTx = await ledger.signTransaction(walletAddress, unsignedTx as any);

      // Send the signed transaction
      const txResponse = await ethereum.provider.sendTransaction(signedTx);

      // Wait for confirmation with timeout
      txReceipt = await ethereum.handleTransactionExecution(txResponse);
    } else {
      // Regular wallet flow
      let wallet;
      try {
        wallet = await ethereum.getWallet(walletAddress);
      } catch (err) {
        logger.error(`Failed to load wallet: ${err.message}`);
        throw httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
      }

      // Get gas options with increased gas limit for Universal Router V2
      // Pancakeswap Universal Router V2 swaps typically use between 200k-500k gas
      const gasLimit = 500000; // Increased for Universal Router V2
      const gasOptions = await ethereum.prepareGasOptions(undefined, gasLimit);
      logger.info(`Using gas limit: ${gasOptions.gasLimit?.toString() || gasLimit}`);

      // Build transaction parameters with gas options
      const txData = {
        to: quote.methodParameters.to,
        data: quote.methodParameters.calldata,
        value: quote.methodParameters.value,
        nonce: await ethereum.provider.getTransactionCount(walletAddress, 'latest'),
        ...gasOptions, // Include gas parameters from prepareGasOptions (includes gasLimit)
      };

      logger.info(`Using gas options: ${JSON.stringify({ ...gasOptions, gasLimit: gasLimit.toString() })}`);

      // Send transaction directly without relying on ethers' automatic gas estimation
      const txResponse = await wallet.sendTransaction(txData);
      logger.info(`Transaction sent: ${txResponse.hash}`);

      // Wait for transaction confirmation with timeout
      txReceipt = await ethereum.handleTransactionExecution(txResponse);
    }

    // Log transaction info if available
    if (txReceipt) {
      logger.info(`Transaction hash: ${txReceipt.transactionHash}`);
      logger.info(`Gas used: ${txReceipt.gasUsed?.toString() || 'unknown'}`);
    }
  } catch (error) {
    logger.error(`Swap execution error: ${error.message}`);
    // Log more details about the error for debugging Universal Router issues
    if (error.error && error.error.data) {
      logger.error(`Error data: ${error.error.data}`);
    }
    if (error.reason) {
      logger.error(`Error reason: ${error.reason}`);
    }
    if (error.transaction) {
      logger.debug(`Transaction details: ${JSON.stringify(error.transaction)}`);
    }
    if (error.receipt) {
      logger.debug(`Transaction receipt: ${JSON.stringify(error.receipt)}`);
    }

    // Handle specific error cases
    if (error.message && error.message.includes('insufficient funds')) {
      throw httpErrors.badRequest(
        'Insufficient funds for transaction. Please ensure you have enough ETH to cover gas costs.',
      );
    } else if (error.message && error.message.includes('cannot estimate gas')) {
      throw httpErrors.badRequest(
        'Transaction would fail. This could be due to an expired quote, insufficient token balance, or market conditions have changed. Please request a new quote.',
      );
    } else if (error.message.includes('rejected on Ledger')) {
      throw httpErrors.badRequest('Transaction rejected on Ledger device');
    } else if (error.message.includes('Ledger device is locked')) {
      throw httpErrors.badRequest(error.message);
    } else if (error.message.includes('Wrong app is open')) {
      throw httpErrors.badRequest(error.message);
    }

    // Re-throw if already an http error
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
  );

  // Handle different transaction states
  if (result.status === 0) {
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

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteQuoteRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched quote from Pancakeswap Universal Router',
        tags: ['/connector/pancakeswap'],
        body: PancakeswapExecuteQuoteRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const {
          walletAddress = getEthereumChainConfig().defaultWallet,
          network = getEthereumChainConfig().defaultNetwork,
          quoteId,
        } = request.body as typeof PancakeswapExecuteQuoteRequest._type;

        return await executeQuote(walletAddress, network, quoteId);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing quote:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

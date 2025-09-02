import { BigNumber, utils, ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { waitForTransactionWithTimeout } from '../../../chains/ethereum/ethereum.utils';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { PancakeswapExecuteQuoteRequest } from '../schemas';

// Permit2 address is constant across all chains
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

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

  // Check and approve allowance if needed - Universal Router V2 uses Permit2
  if (inputToken.address !== ethereum.nativeTokenSymbol) {
    const requiredAllowance = BigNumber.from(quote.trade.inputAmount.quotient.toString());
    const universalRouterAddress = quote.methodParameters.to;

    // Step 1: Check token allowance to Permit2
    logger.info(`Checking ${inputToken.symbol} allowance to Permit2`);
    const tokenContract = ethereum.getContract(inputToken.address, ethereum.provider);
    const tokenToPermit2Allowance = await tokenContract.allowance(walletAddress, PERMIT2_ADDRESS);

    if (BigNumber.from(tokenToPermit2Allowance).lt(requiredAllowance)) {
      const inputAmount = utils.formatUnits(requiredAllowance, inputToken.decimals);
      const currentAllowance = utils.formatUnits(tokenToPermit2Allowance, inputToken.decimals);

      throw fastify.httpErrors.badRequest(
        `Insufficient ${inputToken.symbol} allowance to Permit2. ` +
          `Required: ${inputAmount}, Current: ${currentAllowance}. ` +
          `Please approve ${inputToken.symbol} using spender: "pancakeswap/router"`,
      );
    }

    // Step 2: Check Permit2's allowance to Universal Router
    logger.info(`Checking Permit2 allowance to Universal Router (${universalRouterAddress})`);

    // Permit2 allowance function ABI
    const permit2AllowanceABI = [
      'function allowance(address owner, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)',
    ];

    const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, permit2AllowanceABI, ethereum.provider);
    const [permit2Amount, expiration] = await permit2Contract.allowance(
      walletAddress,
      inputToken.address,
      universalRouterAddress,
    );

    // Check if the Permit2 allowance is expired
    const currentTime = Math.floor(Date.now() / 1000);
    const isExpired = expiration > 0 && expiration < currentTime;

    if (isExpired || BigNumber.from(permit2Amount).lt(requiredAllowance)) {
      const inputAmount = utils.formatUnits(requiredAllowance, inputToken.decimals);
      const currentPermit2Allowance = utils.formatUnits(permit2Amount, inputToken.decimals);

      if (isExpired) {
        throw fastify.httpErrors.badRequest(
          `Permit2 allowance for ${inputToken.symbol} to Universal Router has expired. ` +
            `Please approve ${inputToken.symbol} again using spender: "pancakeswap/router"`,
        );
      } else {
        throw fastify.httpErrors.badRequest(
          `Insufficient Permit2 allowance for ${inputToken.symbol} to Universal Router. ` +
            `Required: ${inputAmount}, Current: ${currentPermit2Allowance}. ` +
            `Please approve ${inputToken.symbol} using spender: "pancakeswap/router"`,
        );
      }
    }

    logger.info(`Both allowances confirmed: Token->Permit2 and Permit2->UniversalRouter`);
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
      txReceipt = await waitForTransactionWithTimeout(txResponse);
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

  // Calculate expected amounts from the trade
  const expectedAmountIn = parseFloat(quote.trade.inputAmount.toExact());
  const expectedAmountOut = parseFloat(quote.trade.outputAmount.toExact());

  // Use the new handleTransactionConfirmation helper
  const result = ethereum.handleTransactionConfirmation(
    txReceipt,
    inputToken.address,
    outputToken.address,
    expectedAmountIn,
    expectedAmountOut,
    side,
  );

  // Handle different transaction states
  if (result.status === -1) {
    // Transaction failed
    logger.error(`Transaction failed on-chain. Receipt: ${JSON.stringify(txReceipt)}`);
    throw fastify.httpErrors.internalServerError(
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

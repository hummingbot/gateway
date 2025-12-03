import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk';
import { BigNumber, Contract, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import { getPancakeswapV3SwapRouter02Address, ISwapRouter02ABI } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';
import { PancakeswapExecuteSwapRequest } from '../schemas';

import { getPancakeswapClmmQuote } from './quoteSwap';

// Default gas limit for CLMM swap operations
const CLMM_SWAP_GAS_LIMIT = 350000;

export async function executeClmmSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  const pancakeswap = await Pancakeswap.getInstance(network);

  // Find pool address
  const poolAddress = await pancakeswap.findDefaultPool(baseToken, quoteToken, 'clmm');
  if (!poolAddress) {
    throw httpErrors.notFound(`No CLMM pool found for pair ${baseToken}-${quoteToken}`);
  }

  // Get quote using the shared quote function
  const { quote } = await getPancakeswapClmmQuote(
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
  );

  // Check if this is a hardware wallet
  const isHardwareWallet = await ethereum.isHardwareWallet(walletAddress);

  // Get SwapRouter02 contract address
  const routerAddress = getPancakeswapV3SwapRouter02Address(network);

  logger.info(`Executing swap using SwapRouter02:`);
  logger.info(`Router address: ${routerAddress}`);
  logger.info(`Pool address: ${poolAddress}`);
  logger.info(`Input token: ${quote.inputToken.address}`);
  logger.info(`Output token: ${quote.outputToken.address}`);
  logger.info(`Side: ${side}`);
  logger.info(`Fee tier: ${quote.feeTier}`);

  // Check allowance for input token
  const amountNeeded = side === 'SELL' ? quote.rawAmountIn : quote.rawMaxAmountIn;

  // Use provider for both hardware and regular wallets to check allowance
  const tokenContract = ethereum.getContract(quote.inputToken.address, ethereum.provider);
  const allowance = await tokenContract.allowance(walletAddress, routerAddress);
  const currentAllowance = BigNumber.from(allowance);

  logger.info(
    `Current allowance: ${formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
  );
  logger.info(
    `Amount needed: ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
  );

  // Check if allowance is sufficient
  if (currentAllowance.lt(amountNeeded)) {
    logger.error(`Insufficient allowance for ${quote.inputToken.symbol}`);
    const requiredFormatted = formatTokenAmount(amountNeeded, quote.inputToken.decimals);
    const currentFormatted = formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals);
    throw httpErrors.badRequest(
      `Insufficient allowance for ${quote.inputToken.symbol}. ` +
        `Current: ${currentFormatted} ${quote.inputToken.symbol}, Required: ${requiredFormatted} ${quote.inputToken.symbol}. ` +
        `To swap with PancakeSwap CLMM, you need to approve the spender "pancakeswap/clmm/swap" instead of "pancakeswap/clmm". ` +
        `This will approve the SwapRouter02 address (${routerAddress}), which is used for routing swaps to CLMM pools. ` +
        `The "pancakeswap/clmm" spender is only for adding liquidity to pools.`,
    );
  }

  logger.info(
    `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
  );

  // Build swap parameters
  const swapParams = {
    tokenIn: quote.inputToken.address,
    tokenOut: quote.outputToken.address,
    fee: quote.feeTier,
    recipient: walletAddress,
    amountIn: 0,
    amountOut: 0,
    amountInMaximum: 0,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: encodeSqrtRatioX96(
      quote.trade.executionPrice.numerator,
      quote.trade.executionPrice.denominator,
    ).toString(),
  };

  let receipt;

  try {
    if (isHardwareWallet) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${walletAddress}. Building swap transaction for Ledger signing.`);

      const ledger = new EthereumLedger();
      const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

      // Build the swap transaction data
      const iface = new utils.Interface(ISwapRouter02ABI);
      let data;

      if (side === 'SELL') {
        // exactInputSingle - we know the exact input amount
        swapParams.amountIn = quote.rawAmountIn;
        swapParams.amountOutMinimum = quote.rawMinAmountOut;

        logger.info(`ExactInputSingle params:`);
        logger.info(`  amountIn: ${swapParams.amountIn}`);
        logger.info(`  amountOutMinimum: ${swapParams.amountOutMinimum}`);

        const exactInputParams = {
          tokenIn: swapParams.tokenIn,
          tokenOut: swapParams.tokenOut,
          fee: swapParams.fee,
          recipient: swapParams.recipient,
          amountIn: swapParams.amountIn,
          amountOutMinimum: swapParams.amountOutMinimum,
          sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96,
        };

        data = iface.encodeFunctionData('exactInputSingle', [exactInputParams]);
      } else {
        // exactOutputSingle - we know the exact output amount
        swapParams.amountOut = quote.rawAmountOut;
        swapParams.amountInMaximum = quote.rawMaxAmountIn;

        logger.info(`ExactOutputSingle params:`);
        logger.info(`  amountOut: ${swapParams.amountOut}`);
        logger.info(`  amountInMaximum: ${swapParams.amountInMaximum}`);

        const exactOutputParams = {
          tokenIn: swapParams.tokenIn,
          tokenOut: swapParams.tokenOut,
          fee: swapParams.fee,
          recipient: swapParams.recipient,
          amountOut: swapParams.amountOut,
          amountInMaximum: swapParams.amountInMaximum,
          sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96,
        };

        data = iface.encodeFunctionData('exactOutputSingle', [exactOutputParams]);
      }

      // Get gas options using estimateGasPrice
      const gasOptions = await ethereum.prepareGasOptions(undefined, CLMM_SWAP_GAS_LIMIT);

      // Build unsigned transaction with gas parameters
      const unsignedTx = {
        to: routerAddress,
        data: data,
        nonce: nonce,
        chainId: ethereum.chainId,
        ...gasOptions, // Include gas parameters from prepareGasOptions
      };

      // Sign with Ledger
      const signedTx = await ledger.signTransaction(walletAddress, unsignedTx as any);

      // Send the signed transaction
      const txResponse = await ethereum.provider.sendTransaction(signedTx);

      logger.info(`Transaction sent: ${txResponse.hash}`);

      // Wait for confirmation with timeout
      receipt = await ethereum.handleTransactionExecution(txResponse);
    } else {
      // Regular wallet flow
      let wallet;
      try {
        wallet = await ethereum.getWallet(walletAddress);
      } catch (err) {
        logger.error(`Failed to load wallet: ${err.message}`);
        throw httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
      }

      const routerContract = new Contract(routerAddress, ISwapRouter02ABI, wallet);

      // Use Ethereum's gas options
      const txOptions = await ethereum.prepareGasOptions(undefined, CLMM_SWAP_GAS_LIMIT);

      let tx;
      if (side === 'SELL') {
        // exactInputSingle - we know the exact input amount
        swapParams.amountIn = quote.rawAmountIn;
        swapParams.amountOutMinimum = quote.rawMinAmountOut;

        logger.info(`ExactInputSingle params:`);
        logger.info(`  amountIn: ${swapParams.amountIn}`);
        logger.info(`  amountOutMinimum: ${swapParams.amountOutMinimum}`);

        const exactInputParams = {
          tokenIn: swapParams.tokenIn,
          tokenOut: swapParams.tokenOut,
          fee: swapParams.fee,
          recipient: swapParams.recipient,
          deadline: Date.now() + 300,
          amountIn: swapParams.amountIn,
          amountOutMinimum: swapParams.amountOutMinimum,
          sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96,
        };

        tx = await routerContract.exactInputSingle(exactInputParams, txOptions);
      } else {
        // exactOutputSingle - we know the exact output amount
        swapParams.amountOut = quote.rawAmountOut;
        swapParams.amountInMaximum = quote.rawMaxAmountIn;

        logger.info(`ExactOutputSingle params:`);
        logger.info(`  amountOut: ${swapParams.amountOut}`);
        logger.info(`  amountInMaximum: ${swapParams.amountInMaximum}`);

        const exactOutputParams = {
          tokenIn: swapParams.tokenIn,
          tokenOut: swapParams.tokenOut,
          fee: swapParams.fee,
          recipient: swapParams.recipient,
          amountOut: swapParams.amountOut,
          amountInMaximum: swapParams.amountInMaximum,
          sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96,
        };

        tx = await routerContract.exactOutputSingle(exactOutputParams, txOptions);
      }

      logger.info(`Transaction sent: ${tx.hash}`);

      // Wait for transaction confirmation
      receipt = await ethereum.handleTransactionExecution(tx);
    }

    // Check if the transaction was successful
    if (receipt.status === 0) {
      logger.error(`Transaction failed on-chain. Receipt: ${JSON.stringify(receipt)}`);
      throw httpErrors.internalServerError(
        'Transaction reverted on-chain. This could be due to slippage, insufficient funds, or other blockchain issues.',
      );
    }

    logger.info(`Transaction hash: ${receipt.transactionHash}`);
    logger.info(`Gas used: ${receipt.gasUsed.toString()}`);

    // Calculate amounts using quote values
    const amountIn = quote.estimatedAmountIn;
    const amountOut = quote.estimatedAmountOut;

    // Calculate balance changes as numbers
    const baseTokenBalanceChange = side === 'BUY' ? amountOut : -amountIn;
    const quoteTokenBalanceChange = side === 'BUY' ? -amountIn : amountOut;

    // Calculate gas fee (formatTokenAmount already returns a number)
    const gasFee = formatTokenAmount(
      receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
      18, // ETH has 18 decimals
    );

    // Determine token addresses for computed fields
    const tokenIn = quote.inputToken.address;
    const tokenOut = quote.outputToken.address;

    return {
      signature: receipt.transactionHash,
      status: receipt.status,
      data: {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: gasFee,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
      },
    };
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
      throw httpErrors.badRequest(
        'Insufficient funds for transaction. Please ensure you have enough ETH to cover gas costs.',
      );
    } else if (error.message.includes('rejected on Ledger')) {
      throw httpErrors.badRequest('Transaction rejected on Ledger device');
    } else if (error.message.includes('Ledger device is locked')) {
      throw httpErrors.badRequest(error.message);
    } else if (error.message.includes('Wrong app is open')) {
      throw httpErrors.badRequest(error.message);
    }

    // Re-throw if already a fastify error
    if (error.statusCode) {
      throw error;
    }

    throw httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Pancakeswap V3 CLMM using SwapRouter02',
        tags: ['/connector/pancakeswap'],
        body: PancakeswapExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct } =
          request.body as typeof PancakeswapExecuteSwapRequest._type;

        return await executeClmmSwap(
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing swap:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

// Export executeSwap alias for uniform chain route imports
export { executeClmmSwap as executeSwap };

export default executeSwapRoute;

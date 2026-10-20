import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk';
import { BigNumber, utils } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { rethrowIfCaptured } from '../../../chains/ethereum/evm-build-mode';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import { getPancakeswapV3SwapRouter02Address, ISwapRouter02ABI } from '../pancakeswap.contracts';

import { getPancakeswapClmmQuote, resolveCounterToken } from './quoteSwap';

// Default gas limit for CLMM swap operations
const CLMM_SWAP_GAS_LIMIT = 350000;

export async function executeClmmSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  await Pancakeswap.getInstance(network);

  // Standardized: quote token is derived from the pool given poolAddress + baseToken.
  const quoteToken = await resolveCounterToken(network, poolAddress, baseToken);

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

  // Get SwapRouter02 contract address
  const routerAddress = getPancakeswapV3SwapRouter02Address(network);

  logger.info(`Executing swap using SwapRouter02:`);
  logger.info(`Router address: ${routerAddress}`);
  logger.info(`Pool address: ${poolAddress}`);
  logger.info(`Input token: ${quote.inputToken.address}`);
  logger.info(`Output token: ${quote.outputToken.address}`);
  logger.info(`Side: ${side}`);
  logger.info(`Fee tier: ${quote.feeTier}`);

  // Check allowance for input token (SwapRouter02 is the spender "pancakeswap/clmm/swap", not "pancakeswap/clmm")
  const amountNeeded = side === 'SELL' ? quote.rawAmountIn : quote.rawMaxAmountIn;
  await ethereum.requireAllowance(
    walletAddress,
    quote.inputToken,
    routerAddress,
    BigNumber.from(amountNeeded),
    'pancakeswap/clmm/swap',
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

  const iface = new utils.Interface(ISwapRouter02ABI);
  const data =
    side === 'SELL'
      ? iface.encodeFunctionData('exactInputSingle', [
          {
            tokenIn: swapParams.tokenIn,
            tokenOut: swapParams.tokenOut,
            fee: swapParams.fee,
            recipient: swapParams.recipient,
            amountIn: quote.rawAmountIn,
            amountOutMinimum: quote.rawMinAmountOut,
            sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96,
          },
        ])
      : iface.encodeFunctionData('exactOutputSingle', [
          {
            tokenIn: swapParams.tokenIn,
            tokenOut: swapParams.tokenOut,
            fee: swapParams.fee,
            recipient: swapParams.recipient,
            amountOut: quote.rawAmountOut,
            amountInMaximum: quote.rawMaxAmountIn,
            sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96,
          },
        ]);

  try {
    const tx = await ethereum.sendTransactionForWallet(walletAddress, {
      to: routerAddress,
      data,
      gasLimit: CLMM_SWAP_GAS_LIMIT,
      description: `PancakeSwap CLMM ${side} swap of ${quote.inputToken.symbol} -> ${quote.outputToken.symbol}`,
    });
    const outcome = await ethereum.handleTransactionConfirmation(tx);

    // A revert threw out of the confirmation helper as a 400 TRANSACTION_FAILED. What is left
    // is a transaction that is still pending after the extended poll: report it as PENDING
    // with its hash rather than dereferencing a null receipt and losing the hash to a 500.
    if (!outcome.confirmed) {
      return { signature: outcome.signature, status: TransactionStatus.PENDING };
    }

    logger.info(`Transaction hash: ${outcome.signature}`);
    logger.info(`Gas used: ${outcome.receipt.gasUsed.toString()}`);

    // Calculate amounts using quote values
    const amountIn = quote.estimatedAmountIn;
    const amountOut = quote.estimatedAmountOut;

    // Calculate balance changes as numbers
    const baseTokenBalanceChange = side === 'BUY' ? amountOut : -amountIn;
    const quoteTokenBalanceChange = side === 'BUY' ? -amountIn : amountOut;

    // Determine token addresses for computed fields
    const tokenIn = quote.inputToken.address;
    const tokenOut = quote.outputToken.address;

    return {
      signature: outcome.signature,
      status: TransactionStatus.CONFIRMED,
      data: {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: outcome.fee,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
        slippagePct,
      },
    };
  } catch (error) {
    rethrowIfCaptured(error);
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

// Export executeSwap alias for uniform chain route imports
export { executeClmmSwap as executeSwap };

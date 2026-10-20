import { BigNumber, utils } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { rethrowIfCaptured } from '../../../chains/ethereum/evm-build-mode';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import { getPancakeswapV2RouterAddress, IPancakeswapV2Router02ABI } from '../pancakeswap.contracts';

import { resolveSwapPair } from './poolTokens';
import { getPancakeswapAmmQuote } from './quoteSwap';

// Default gas limit for AMM swap operations
const AMM_SWAP_GAS_LIMIT = 300000;

export async function executeAmmSwap(
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
  const poolAddress = await pancakeswap.findDefaultPool(baseToken, quoteToken, 'amm');
  if (!poolAddress) {
    throw httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
  }

  // Get quote using the shared quote function
  const { quote } = await getPancakeswapAmmQuote(
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
  );

  // Get Router02 contract address
  const routerAddress = getPancakeswapV2RouterAddress(network);

  logger.info(`Executing swap using Router02:`);
  logger.info(`Router address: ${routerAddress}`);
  logger.info(`Pool address: ${poolAddress}`);
  logger.info(`Input token: ${quote.inputToken.address}`);
  logger.info(`Output token: ${quote.outputToken.address}`);
  logger.info(`Side: ${side}`);
  logger.info(`Path: ${quote.pathAddresses.join(' -> ')}`);

  // Check allowance for input token
  const amountNeeded = side === 'SELL' ? quote.rawAmountIn : quote.rawMaxAmountIn;
  await ethereum.requireAllowance(
    walletAddress,
    quote.inputToken,
    routerAddress,
    BigNumber.from(amountNeeded),
    'pancakeswap/amm',
  );

  // Prepare transaction parameters
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  const iface = new utils.Interface(IPancakeswapV2Router02ABI.abi);
  const data =
    side === 'SELL'
      ? iface.encodeFunctionData('swapExactTokensForTokens', [
          quote.rawAmountIn,
          quote.rawMinAmountOut,
          quote.pathAddresses,
          walletAddress,
          deadline,
        ])
      : iface.encodeFunctionData('swapTokensForExactTokens', [
          quote.rawAmountOut,
          quote.rawMaxAmountIn,
          quote.pathAddresses,
          walletAddress,
          deadline,
        ]);

  try {
    const tx = await ethereum.sendTransactionForWallet(walletAddress, {
      to: routerAddress,
      data,
      gasLimit: AMM_SWAP_GAS_LIMIT,
      description: `PancakeSwap AMM ${side} swap of ${quote.inputToken.symbol} -> ${quote.outputToken.symbol}`,
    });
    const outcome = await ethereum.handleTransactionConfirmation(tx);

    // A revert threw out of the confirmation helper as a 400 TRANSACTION_FAILED. What is left
    // is a transaction that is still pending after the extended poll: report it as PENDING
    // with its hash rather than dereferencing a null receipt and losing the hash to a 500.
    if (!outcome.confirmed) {
      return { signature: outcome.signature, status: TransactionStatus.PENDING };
    }

    logger.info(`Transaction confirmed: ${outcome.signature}`);
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

    // Re-throw if already a fastify error
    if (error.statusCode) {
      throw error;
    }

    throw httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
  }
}

/**
 * Standard AMM execute-swap entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. The quote token is derived from the pool; `amount` is denominated in the base token.
 */
export async function executeSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const { baseAddress, quoteAddress } = await resolveSwapPair(network, poolAddress, baseToken);
  return await executeAmmSwap(walletAddress, network, baseAddress, quoteAddress, amount, side, slippagePct);
}

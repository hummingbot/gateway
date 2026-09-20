import { BigNumber, Contract, utils } from 'ethers';

import { Ethereum, EthereumTransactionOutcome } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';
import { getUniswapV2RouterAddress, IUniswapV2Router02ABI } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

import { resolveSwapPair } from './poolTokens';
import { getUniswapAmmQuote } from './quoteSwap';

// Default gas limit for AMM swap operations
const AMM_SWAP_GAS_LIMIT = 300000;

export async function executeAmmSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  const uniswap = await Uniswap.getInstance(network);

  // Find pool address
  const poolAddress = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');
  if (!poolAddress) {
    throw httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
  }

  // Get quote using the shared quote function
  const { quote } = await getUniswapAmmQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);

  // Check if this is a hardware wallet
  const isHardwareWallet = await ethereum.isHardwareWallet(walletAddress);

  // Get Router02 contract address
  const routerAddress = getUniswapV2RouterAddress(network);

  logger.info(`Executing swap using Router02:`);
  logger.info(`Router address: ${routerAddress}`);
  logger.info(`Pool address: ${poolAddress}`);
  logger.info(`Input token: ${quote.inputToken.address}`);
  logger.info(`Output token: ${quote.outputToken.address}`);
  logger.info(`Side: ${side}`);
  logger.info(`Path: ${quote.pathAddresses.join(' -> ')}`);

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
    throw httpErrors.badRequest(
      `Insufficient allowance for ${quote.inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol} for the Uniswap router (${routerAddress})`,
    );
  }

  logger.info(
    `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
  );

  // Prepare transaction parameters
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  let outcome: EthereumTransactionOutcome;

  try {
    if (isHardwareWallet) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${walletAddress}. Building swap transaction for Ledger signing.`);

      const ledger = new EthereumLedger();
      const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

      // Build the swap transaction data
      const iface = new utils.Interface(IUniswapV2Router02ABI.abi);
      let data;

      if (side === 'SELL') {
        logger.info(`ExactTokensForTokens params:`);
        logger.info(`  amountIn: ${quote.rawAmountIn}`);
        logger.info(`  amountOutMin: ${quote.rawMinAmountOut}`);
        logger.info(`  path: ${quote.pathAddresses}`);
        logger.info(`  deadline: ${deadline}`);

        data = iface.encodeFunctionData('swapExactTokensForTokens', [
          quote.rawAmountIn,
          quote.rawMinAmountOut,
          quote.pathAddresses,
          walletAddress,
          deadline,
        ]);
      } else {
        logger.info(`TokensForExactTokens params:`);
        logger.info(`  amountOut: ${quote.rawAmountOut}`);
        logger.info(`  amountInMax: ${quote.rawMaxAmountIn}`);
        logger.info(`  path: ${quote.pathAddresses}`);
        logger.info(`  deadline: ${deadline}`);

        data = iface.encodeFunctionData('swapTokensForExactTokens', [
          quote.rawAmountOut,
          quote.rawMaxAmountIn,
          quote.pathAddresses,
          walletAddress,
          deadline,
        ]);
      }

      // Get gas options using estimateGasPrice
      const gasOptions = await ethereum.prepareGasOptions(undefined, AMM_SWAP_GAS_LIMIT);

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
      outcome = await ethereum.handleTransactionConfirmation(txResponse);
    } else {
      // Regular wallet flow
      let wallet;
      try {
        wallet = await ethereum.getWallet(walletAddress);
      } catch (err) {
        logger.error(`Failed to load wallet: ${err.message}`);
        throw httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
      }

      const routerContract = new Contract(routerAddress, IUniswapV2Router02ABI.abi, wallet);

      // Get gas options using estimateGasPrice
      const gasOptions = await ethereum.prepareGasOptions(undefined, AMM_SWAP_GAS_LIMIT);
      const txOptions: any = { ...gasOptions };

      logger.info(`Using gas options: ${JSON.stringify(txOptions)}`);

      let tx;
      if (side === 'SELL') {
        // swapExactTokensForTokens - we know the exact input amount
        logger.info(`ExactTokensForTokens params:`);
        logger.info(`  amountIn: ${quote.rawAmountIn}`);
        logger.info(`  amountOutMin: ${quote.rawMinAmountOut}`);
        logger.info(`  path: ${quote.pathAddresses}`);
        logger.info(`  deadline: ${deadline}`);

        tx = await routerContract.swapExactTokensForTokens(
          quote.rawAmountIn,
          quote.rawMinAmountOut,
          quote.pathAddresses,
          walletAddress,
          deadline,
          txOptions,
        );
      } else {
        // swapTokensForExactTokens - we know the exact output amount
        logger.info(`TokensForExactTokens params:`);
        logger.info(`  amountOut: ${quote.rawAmountOut}`);
        logger.info(`  amountInMax: ${quote.rawMaxAmountIn}`);
        logger.info(`  path: ${quote.pathAddresses}`);
        logger.info(`  deadline: ${deadline}`);

        tx = await routerContract.swapTokensForExactTokens(
          quote.rawAmountOut,
          quote.rawMaxAmountIn,
          quote.pathAddresses,
          walletAddress,
          deadline,
          txOptions,
        );
      }

      logger.info(`Transaction sent: ${tx.hash}`);

      // Wait for transaction confirmation
      outcome = await ethereum.handleTransactionConfirmation(tx);
    }

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
    logger.error(`Swap execution error: ${error.message}`);

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

    // Re-throw if already an http error
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
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const { baseAddress, quoteAddress } = await resolveSwapPair(network, poolAddress, baseToken);
  return await executeAmmSwap(walletAddress, network, baseAddress, quoteAddress, amount, side, slippagePct);
}

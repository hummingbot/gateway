import { BigNumber, Contract, providers, utils } from 'ethers';

import { Ethereum, EthereumTransactionOutcome } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';
import { getUniswapV3SwapRouter02Address, ISwapRouter02ABI } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

import { getUniswapClmmQuote, resolveCounterToken } from './quoteSwap';

// Default gas limit for CLMM swap operations
const CLMM_SWAP_GAS_LIMIT = 350000;

// Uniswap V3 pool `Swap` event. Its two amounts are signed from the pool's point of
// view — positive is what the pool took in, negative what it paid out — which
// identifies the input and output sides without needing token0/token1 ordering.
const SWAP_EVENT_TOPIC = utils.id('Swap(address,address,int256,int256,uint160,uint128,int24)');
const SWAP_EVENT_TYPES = ['int256', 'int256', 'uint160', 'uint128', 'int24'];

/**
 * Read what the swap actually moved, from the receipt.
 *
 * The quote is an estimate taken before the transaction lands, and the fill can differ
 * from it — the pool moves under the trade, or the trade is sandwiched. Those are
 * exactly the cases a caller needs to see, so the executed amounts come from the pool's
 * own event rather than from the quote. Returns null if the event is absent.
 */
function readExecutedAmounts(
  receipt: providers.TransactionReceipt,
  poolAddress: string,
  inputDecimals: number,
  outputDecimals: number,
): { amountIn: number; amountOut: number } | null {
  const swapLog = receipt.logs.find(
    (log) => log.address.toLowerCase() === poolAddress.toLowerCase() && log.topics[0] === SWAP_EVENT_TOPIC,
  );
  if (!swapLog) {
    return null;
  }

  const [amount0, amount1] = utils.defaultAbiCoder.decode(SWAP_EVENT_TYPES, swapLog.data) as BigNumber[];
  const rawIn = amount0.isNegative() ? amount1 : amount0;
  const rawOut = amount0.isNegative() ? amount0 : amount1;

  return {
    amountIn: Number(utils.formatUnits(rawIn, inputDecimals)),
    amountOut: Number(utils.formatUnits(rawOut.mul(-1), outputDecimals)),
  };
}

export async function executeClmmSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  await Uniswap.getInstance(network);

  // Standardized: quote token is derived from the pool given poolAddress + baseToken.
  const quoteToken = await resolveCounterToken(network, poolAddress, baseToken);

  // Get quote using the shared quote function
  const { quote } = await getUniswapClmmQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);

  // Check if this is a hardware wallet
  const isHardwareWallet = await ethereum.isHardwareWallet(walletAddress);

  // Get SwapRouter02 contract address
  const routerAddress = getUniswapV3SwapRouter02Address(network);

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
        `To swap with Uniswap CLMM, you need to approve the spender "uniswap/clmm/swap" instead of "uniswap/clmm". ` +
        `This will approve the SwapRouter02 address (${routerAddress}), which is used for routing swaps to CLMM pools. ` +
        `The "uniswap/clmm" spender is only for adding liquidity to pools.`,
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
    // No price limit: slippage protection comes from amountOutMinimum /
    // amountInMaximum (set from the quote below). Encoding the trade's
    // *average* execution price here makes any swap whose ending price
    // crosses its own average partial-fill at the limit and revert with
    // "Too little received" — near-guaranteed on thin pools or any size
    // with more than ~a tick of impact.
    sqrtPriceLimitX96: '0',
  };

  let outcome: EthereumTransactionOutcome;

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

    // Report what the swap moved, not what the quote predicted. Falling back to the
    // quote is a last resort rather than the default: a settled swap must still return
    // its hash, so an undecodable receipt is logged loudly instead of thrown.
    const executed = readExecutedAmounts(
      outcome.receipt,
      poolAddress,
      quote.inputToken.decimals,
      quote.outputToken.decimals,
    );
    if (!executed) {
      logger.warn(
        `No Swap event for pool ${poolAddress} in ${outcome.signature}: reporting quoted ` +
          'amounts, which may not match the fill.',
      );
    }
    const amountIn = executed ? executed.amountIn : quote.estimatedAmountIn;
    const amountOut = executed ? executed.amountOut : quote.estimatedAmountOut;

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

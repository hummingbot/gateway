import { BigNumber, Contract, utils } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import { getPancakeswapV2RouterAddress, IPancakeswapV2Router02ABI } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';
import { PancakeswapAmmExecuteSwapRequest } from '../schemas';

import { getPancakeswapAmmQuote } from './quoteSwap';

// Default gas limit for AMM swap operations
const AMM_SWAP_GAS_LIMIT = 300000;

export async function executeAmmSwap(
  fastify: FastifyInstance,
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
    throw fastify.httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
  }

  // Get quote using the shared quote function
  const { quote } = await getPancakeswapAmmQuote(
    fastify,
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
    throw fastify.httpErrors.badRequest(
      `Insufficient allowance for ${quote.inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol} for the Pancakeswap router (${routerAddress})`,
    );
  }

  logger.info(
    `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
  );

  // Prepare transaction parameters
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  let receipt;

  try {
    if (isHardwareWallet) {
      // Hardware wallet flow
      logger.info(`Hardware wallet detected for ${walletAddress}. Building swap transaction for Ledger signing.`);

      const ledger = new EthereumLedger();
      const nonce = await ethereum.provider.getTransactionCount(walletAddress, 'latest');

      // Build the swap transaction data
      const iface = new utils.Interface(IPancakeswapV2Router02ABI.abi);
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
      receipt = await ethereum.handleTransactionExecution(txResponse);
    } else {
      // Regular wallet flow
      let wallet;
      try {
        wallet = await ethereum.getWallet(walletAddress);
      } catch (err) {
        logger.error(`Failed to load wallet: ${err.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
      }

      const routerContract = new Contract(routerAddress, IPancakeswapV2Router02ABI.abi, wallet);

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
      receipt = await ethereum.handleTransactionExecution(tx);
    }

    // Check if the transaction was successful
    if (receipt.status === 0) {
      logger.error(`Transaction failed on-chain. Receipt: ${JSON.stringify(receipt)}`);
      throw fastify.httpErrors.internalServerError(
        'Transaction reverted on-chain. This could be due to slippage, insufficient funds, or other blockchain issues.',
      );
    }

    logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
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

    // Handle specific error cases
    if (error.message && error.message.includes('insufficient funds')) {
      throw fastify.httpErrors.badRequest(
        'Insufficient funds for transaction. Please ensure you have enough ETH to cover gas costs.',
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
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Pancakeswap V2 AMM using Router02',
        tags: ['/connector/pancakeswap'],
        body: PancakeswapAmmExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const ethereumConfig = getEthereumChainConfig();
        const {
          walletAddress = ethereumConfig.defaultWallet,
          network = ethereumConfig.defaultNetwork,
          baseToken,
          quoteToken,
          amount,
          side = 'SELL',
          slippagePct,
        } = request.body as typeof PancakeswapAmmExecuteSwapRequest._type;

        return await executeAmmSwap(
          fastify,
          walletAddress,
          network,
          baseToken,
          quoteToken || '', // Handle optional quoteToken
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

// Export executeSwap alias for uniform chain route imports
export { executeAmmSwap as executeSwap };

export default executeSwapRoute;

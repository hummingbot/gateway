import { BigNumber, Contract, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { EthereumLedger } from '../../../chains/ethereum/ethereum-ledger';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { ETCswap } from '../etcswap';
import { ETCswapConfig } from '../etcswap.config';
import { getETCswapV3SwapRouter02Address, ISwapRouter02ABI, isV3Available } from '../etcswap.contracts';
import { formatTokenAmount } from '../etcswap.utils';
import { ETCswapClmmExecuteSwapRequest } from '../schemas';

import { getETCswapClmmQuote } from './quoteSwap';

// Default gas limit for CLMM swap operations
const CLMM_SWAP_GAS_LIMIT = 350000;

export async function executeClmmSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = ETCswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  // Check if V3 is available on this network
  if (!isV3Available(network)) {
    throw httpErrors.badRequest(`ETCswap V3 (CLMM) is not available on network: ${network}`);
  }

  const ethereum = await Ethereum.getInstance(network);
  await ethereum.init();

  const etcswap = await ETCswap.getInstance(network);

  // Find pool address
  const poolAddress = await etcswap.findDefaultPool(baseToken, quoteToken, 'clmm');
  if (!poolAddress) {
    throw httpErrors.notFound(`No CLMM pool found for pair ${baseToken}-${quoteToken}`);
  }

  // Get quote using the shared quote function
  const { quote } = await getETCswapClmmQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);

  // Check if this is a hardware wallet
  const isHardwareWallet = await ethereum.isHardwareWallet(walletAddress);

  // Get SwapRouter02 contract address
  const routerAddress = getETCswapV3SwapRouter02Address(network);

  logger.info(`Executing swap using ETCswap V3 SwapRouter02:`);
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
    throw httpErrors.badRequest(
      `Insufficient allowance for ${quote.inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol} for the ETCswap V3 router (${routerAddress})`,
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
      const iface = new utils.Interface(ISwapRouter02ABI);
      let data;

      if (side === 'SELL') {
        // exactInputSingle
        const params = {
          tokenIn: quote.inputToken.address,
          tokenOut: quote.outputToken.address,
          fee: quote.feeTier,
          recipient: walletAddress,
          amountIn: quote.rawAmountIn,
          amountOutMinimum: quote.rawMinAmountOut,
          sqrtPriceLimitX96: 0, // No price limit
        };
        data = iface.encodeFunctionData('exactInputSingle', [params]);
      } else {
        // exactOutputSingle
        const params = {
          tokenIn: quote.inputToken.address,
          tokenOut: quote.outputToken.address,
          fee: quote.feeTier,
          recipient: walletAddress,
          amountOut: quote.rawAmountOut,
          amountInMaximum: quote.rawMaxAmountIn,
          sqrtPriceLimitX96: 0, // No price limit
        };
        data = iface.encodeFunctionData('exactOutputSingle', [params]);
      }

      // Get gas options
      const gasOptions = await ethereum.prepareGasOptions(undefined, CLMM_SWAP_GAS_LIMIT);

      // Build unsigned transaction
      const unsignedTx = {
        to: routerAddress,
        data: data,
        nonce: nonce,
        chainId: ethereum.chainId,
        ...gasOptions,
      };

      // Sign with Ledger
      const signedTx = await ledger.signTransaction(walletAddress, unsignedTx as any);

      // Send the signed transaction
      const txResponse = await ethereum.provider.sendTransaction(signedTx);

      logger.info(`Transaction sent: ${txResponse.hash}`);

      // Wait for confirmation
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

      // Get gas options
      const gasOptions = await ethereum.prepareGasOptions(undefined, CLMM_SWAP_GAS_LIMIT);
      const txOptions: any = { ...gasOptions };

      logger.info(`Using gas options: ${JSON.stringify(txOptions)}`);

      let tx;
      if (side === 'SELL') {
        // exactInputSingle
        const params = {
          tokenIn: quote.inputToken.address,
          tokenOut: quote.outputToken.address,
          fee: quote.feeTier,
          recipient: walletAddress,
          amountIn: quote.rawAmountIn,
          amountOutMinimum: quote.rawMinAmountOut,
          sqrtPriceLimitX96: 0, // No price limit
        };

        logger.info(`exactInputSingle params: ${JSON.stringify(params)}`);
        tx = await routerContract.exactInputSingle(params, txOptions);
      } else {
        // exactOutputSingle
        const params = {
          tokenIn: quote.inputToken.address,
          tokenOut: quote.outputToken.address,
          fee: quote.feeTier,
          recipient: walletAddress,
          amountOut: quote.rawAmountOut,
          amountInMaximum: quote.rawMaxAmountIn,
          sqrtPriceLimitX96: 0, // No price limit
        };

        logger.info(`exactOutputSingle params: ${JSON.stringify(params)}`);
        tx = await routerContract.exactOutputSingle(params, txOptions);
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

    logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
    logger.info(`Gas used: ${receipt.gasUsed.toString()}`);

    // Calculate amounts using quote values
    const amountIn = quote.estimatedAmountIn;
    const amountOut = quote.estimatedAmountOut;

    // Calculate balance changes
    const baseTokenBalanceChange = side === 'BUY' ? amountOut : -amountIn;
    const quoteTokenBalanceChange = side === 'BUY' ? -amountIn : amountOut;

    // Calculate gas fee
    const gasFee = formatTokenAmount(
      receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
      18, // ETC has 18 decimals
    );

    // Determine token addresses
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
      throw httpErrors.badRequest(
        'Insufficient funds for transaction. Please ensure you have enough ETC to cover gas costs.',
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

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on ETCswap V3 CLMM',
        tags: ['/connector/etcswap'],
        body: ETCswapClmmExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const ethereumConfig = getEthereumChainConfig();
        const {
          walletAddress = ethereumConfig.defaultWallet,
          network = 'classic',
          baseToken,
          quoteToken,
          amount,
          side = 'SELL',
          slippagePct,
        } = request.body as typeof ETCswapClmmExecuteSwapRequest._type;

        return await executeClmmSwap(
          walletAddress,
          network,
          baseToken,
          quoteToken || '',
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

// Export executeSwap alias
export { executeClmmSwap as executeSwap };

export default executeSwapRoute;

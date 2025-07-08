import { BigNumber, Contract } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { wrapEthereum } from '../../../chains/ethereum/routes/wrap';
import {
  ExecuteSwapRequest,
  ExecuteSwapRequestType,
  ExecuteSwapResponse,
  ExecuteSwapResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import {
  getUniswapV3SmartOrderRouterAddress,
  ISwapRouter02ABI,
} from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

import { getUniswapClmmQuote } from './quoteSwap';

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Uniswap V3 CLMM using SwapRouter02',
        tags: ['/connector/uniswap'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'base' },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: ExecuteSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          walletAddress: requestedWalletAddress,
          priorityFeePerCU,
          computeUnits,
        } = request.body;

        const networkToUse = network;

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await Ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no wallets found.',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Find pool address if not provided
        const uniswap = await Uniswap.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(
            baseToken,
            quoteToken,
            'clmm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        // Get quote using the shared quote function - this eliminates duplication
        const { quote, ethereum, baseTokenObj, quoteTokenObj } =
          await getUniswapClmmQuote(
            fastify,
            networkToUse,
            poolAddress,
            baseToken,
            quoteToken,
            amount,
            side as 'BUY' | 'SELL',
            slippagePct,
          );

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Extract info from quote
        let wrapTxHash = null;
        let inputTokenAddress = quote.inputToken.address;
        let outputTokenAddress = quote.outputToken.address;

        // Handle ETH->WETH wrapping if needed
        if (baseToken === 'ETH' && side === 'SELL') {
          const wethToken = uniswap.getTokenBySymbol('WETH');
          if (!wethToken) {
            throw new Error('WETH token not found');
          }

          logger.info(
            `ETH detected as input token, wrapping ${amount} ETH to WETH first`,
          );

          const wrapResult = await wrapEthereum(
            fastify,
            networkToUse,
            walletAddress,
            amount.toString(),
          );
          wrapTxHash = wrapResult.signature;
          inputTokenAddress = wethToken.address;

          logger.info(
            `Successfully wrapped ${amount} ETH to WETH, transaction hash: ${wrapTxHash}`,
          );
        }

        // Handle output ETH conversion (we're using WETH)
        if (quoteToken === 'ETH' && side === 'BUY') {
          const wethToken = uniswap.getTokenBySymbol('WETH');
          if (!wethToken) {
            throw new Error('WETH token not found');
          }
          outputTokenAddress = wethToken.address;
          logger.info('ETH detected as output token, will use WETH instead');
        }

        // Get SwapRouter02 contract
        const routerAddress = getUniswapV3SmartOrderRouterAddress(networkToUse);
        const routerContract = new Contract(
          routerAddress,
          ISwapRouter02ABI,
          wallet,
        );

        logger.info(`Executing swap using SwapRouter02:`);
        logger.info(`Router address: ${routerAddress}`);
        logger.info(`Pool address: ${poolAddress}`);
        logger.info(`Input token: ${inputTokenAddress}`);
        logger.info(`Output token: ${outputTokenAddress}`);
        logger.info(`Side: ${side}`);
        logger.info(`Fee tier: ${quote.feeTier}`);

        // Check allowance for input token (including WETH)
        const tokenContract = ethereum.getContract(inputTokenAddress, wallet);
        const allowance = await ethereum.getERC20Allowance(
          tokenContract,
          wallet,
          routerAddress,
          quote.inputToken.decimals,
        );

        const amountNeeded =
          side === 'SELL' ? quote.rawAmountIn : quote.rawMaxAmountIn;
        const currentAllowance = BigNumber.from(allowance.value);

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
            `Insufficient allowance for ${quote.inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol} (${inputTokenAddress}) for the Uniswap SwapRouter02 (${routerAddress})`,
          );
        } else {
          logger.info(
            `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), quote.inputToken.decimals)} ${quote.inputToken.symbol}`,
          );
        }

        // Build swap parameters
        const swapParams = {
          tokenIn: inputTokenAddress,
          tokenOut: outputTokenAddress,
          fee: quote.feeTier,
          recipient: walletAddress,
          amountIn: 0,
          amountOut: 0,
          amountInMaximum: 0,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        };

        // Use provided gas parameters or defaults
        const gasLimit = computeUnits || 300000;

        // For Ethereum, priorityFeePerCU is interpreted as gas price in Gwei
        const txOptions: any = { gasLimit };

        if (priorityFeePerCU !== undefined) {
          // Convert from Gwei to Wei (1 Gwei = 1e9 Wei)
          const gasPriceWei = BigNumber.from(priorityFeePerCU).mul(1e9);
          txOptions.gasPrice = gasPriceWei;
          logger.info(`Using custom gas price: ${priorityFeePerCU} Gwei`);
        }

        logger.info(`Using gas limit: ${gasLimit}`);

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

          tx = await routerContract.exactInputSingle(
            exactInputParams,
            txOptions,
          );
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

          tx = await routerContract.exactOutputSingle(
            exactOutputParams,
            txOptions,
          );
        }

        logger.info(`Transaction sent: ${tx.hash}`);

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        // Check if the transaction was successful
        if (receipt.status === 0) {
          logger.error(
            `Transaction failed on-chain. Receipt: ${JSON.stringify(receipt)}`,
          );
          throw new Error(
            'Transaction reverted on-chain. This could be due to slippage, insufficient funds, or other blockchain issues.',
          );
        }

        logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
        logger.info(`Gas used: ${receipt.gasUsed.toString()}`);

        // Calculate amounts using quote values
        const totalInputSwapped = quote.estimatedAmountIn;
        const totalOutputSwapped = quote.estimatedAmountOut;

        // Calculate balance changes as numbers
        const baseTokenBalanceChange =
          side === 'BUY' ? totalOutputSwapped : -totalInputSwapped;
        const quoteTokenBalanceChange =
          side === 'BUY' ? -totalInputSwapped : totalOutputSwapped;

        // Calculate gas fee (formatTokenAmount already returns a number)
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        // Include both swap and wrap txHash in the response if applicable
        const txSignature = wrapTxHash
          ? `swap:${receipt.transactionHash},wrap:${wrapTxHash}`
          : receipt.transactionHash;

        // Get current tick from pool
        const activeBinId = quote.currentTick || 0;

        // Determine token addresses for computed fields
        const tokenIn = quote.inputToken.address;
        const tokenOut = quote.outputToken.address;

        return {
          signature: txSignature,
          status: 1, // CONFIRMED
          data: {
            totalInputSwapped: totalInputSwapped,
            totalOutputSwapped: totalOutputSwapped,
            fee: gasFee,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
            activeBinId,
            // Computed fields for clarity
            tokenIn,
            tokenOut,
          },
        };
      } catch (error) {
        logger.error(`Swap execution error: ${error.message}`);
        if (error.transaction) {
          logger.debug(
            `Transaction details: ${JSON.stringify(error.transaction)}`,
          );
        }
        if (error.receipt) {
          logger.debug(`Transaction receipt: ${JSON.stringify(error.receipt)}`);
        }

        // Check if this is already a fastify error
        if (error.statusCode) {
          throw error;
        }

        // Provide more detailed error messages for common issues
        const errorMessage = error.reason || error.message;
        throw fastify.httpErrors.internalServerError(
          `Failed to execute swap: ${errorMessage}`,
        );
      }
    },
  );
};

export default executeSwapRoute;

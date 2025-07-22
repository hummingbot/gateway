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
import { ETCSwap } from '../etcSwap';
import { getETCSwapV3SmartOrderRouterAddress, ISwapRouter02ABI } from '../etcSwap.contracts';
import { formatTokenAmount } from '../etcSwap.utils';

import { getETCSwapClmmQuote } from './quoteSwap';

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
        description: 'Execute a swap on ETCSwap V3 CLMM using SwapRouter02',
        tags: ['/connector/etcSwap'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'base' },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['WETC'] },
            quoteToken: { type: 'string', examples: ['USC'] },
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
            throw fastify.httpErrors.badRequest('No wallet address provided and no wallets found.');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Find pool address if not provided
        const etcSwap = await ETCSwap.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await etcSwap.findDefaultPool(baseToken, quoteToken, 'clmm');

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(`No CLMM pool found for pair ${baseToken}-${quoteToken}`);
          }
        }

        // Get quote using the shared quote function - this eliminates duplication
        const { quote, ethereum } = await getETCSwapClmmQuote(
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

        // Handle ETC->WETC wrapping if needed
        if (baseToken === 'ETC' && side === 'SELL') {
          const wethToken = etcSwap.getTokenBySymbol('WETC');
          if (!wethToken) {
            throw new Error('WETC token not found');
          }

          logger.info(`ETC detected as input token, wrapping ${amount} ETC to WETC first`);

          const wrapResult = await wrapEthereum(fastify, networkToUse, walletAddress, amount.toString());
          wrapTxHash = wrapResult.signature;
          inputTokenAddress = wethToken.address;

          logger.info(`Successfully wrapped ${amount} ETC to WETC, transaction hash: ${wrapTxHash}`);
        }

        // Handle output ETC conversion (we're using WETC)
        if (quoteToken === 'ETC' && side === 'BUY') {
          const wethToken = etcSwap.getTokenBySymbol('WETC');
          if (!wethToken) {
            throw new Error('WETC token not found');
          }
          outputTokenAddress = wethToken.address;
          logger.info('ETC detected as output token, will use WETC instead');
        }

        // Get SwapRouter02 contract
        const routerAddress = getETCSwapV3SmartOrderRouterAddress(networkToUse);
        const routerContract = new Contract(routerAddress, ISwapRouter02ABI, wallet);

        logger.info(`Executing swap using SwapRouter02:`);
        logger.info(`Router address: ${routerAddress}`);
        logger.info(`Pool address: ${poolAddress}`);
        logger.info(`Input token: ${inputTokenAddress}`);
        logger.info(`Output token: ${outputTokenAddress}`);
        logger.info(`Side: ${side}`);
        logger.info(`Fee tier: ${quote.feeTier}`);

        // Check allowance for input token (including WETC)
        const tokenContract = ethereum.getContract(inputTokenAddress, wallet);
        const allowance = await ethereum.getERC20Allowance(
          tokenContract,
          wallet,
          routerAddress,
          quote.inputToken.decimals,
        );

        const amountNeeded = side === 'SELL' ? quote.rawAmountIn : quote.rawMaxAmountIn;
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
            `Insufficient allowance for ${quote.inputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded, quote.inputToken.decimals)} ${quote.inputToken.symbol} (${inputTokenAddress}) for the ETCSwap SwapRouter02 (${routerAddress})`,
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

        return {
          signature: tx.hash,
          status: 0, // UNCONFIRMED
          data: undefined,
        };
      } catch (error) {
        logger.error(`Swap execution error: ${error.message}`);
        if (error.transaction) {
          logger.debug(`Transaction details: ${JSON.stringify(error.transaction)}`);
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
        throw fastify.httpErrors.internalServerError(`Failed to execute swap: ${errorMessage}`);
      }
    },
  );
};

export default executeSwapRoute;

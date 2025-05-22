import { Contract } from '@ethersproject/contracts';
import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import {
  Pair as V2Pair,
  Route as V2Route,
  Trade as V2Trade,
} from '@uniswap/v2-sdk';
import { BigNumber, Wallet, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { wrapEthereum } from '../../../chains/ethereum/routes/wrap';
import {
  ExecuteSwapRequestType,
  ExecuteSwapRequest,
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
} from '../../../schemas/trading-types/swap-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { IUniswapV2Router02ABI } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

async function handleEthToWethWrapping(
  fastify: any,
  networkToUse: string,
  walletAddress: string,
  inputToken: Token,
  outputToken: Token,
  inputAmount: CurrencyAmount<Token>,
): Promise<{
  wrapTxHash: string | null;
  actualInputToken: Token;
  actualOutputToken: Token;
  actualInputAmount: CurrencyAmount<Token>;
}> {
  let wrapTxHash = null;
  let actualInputToken = inputToken;
  let actualOutputToken = outputToken;
  let actualInputAmount = inputAmount;

  // If user inputs ETH, wrap it to WETH first
  if (inputToken.symbol === 'ETH') {
    const uniswap = await Uniswap.getInstance(networkToUse);
    const wethToken = uniswap.getTokenBySymbol('WETH');

    if (!wethToken) {
      throw new Error('WETH token not found');
    }

    // Convert the amount to ETH string for wrapping
    const amountInEth = formatTokenAmount(
      inputAmount.quotient.toString(),
      18,
    ).toString();

    logger.info(
      `ETH detected as input token, wrapping ${amountInEth} ETH to WETH first`,
    );

    const wrapResult = await wrapEthereum(
      fastify,
      networkToUse,
      walletAddress,
      amountInEth,
    );
    wrapTxHash = wrapResult.txHash;

    // Update to use WETH instead of ETH
    actualInputToken = wethToken;
    actualInputAmount = CurrencyAmount.fromRawAmount(
      wethToken,
      inputAmount.quotient.toString(),
    );

    logger.info(
      `Successfully wrapped ${amountInEth} ETH to WETH, transaction hash: ${wrapTxHash}`,
    );
  }

  // If user wants ETH as output, use WETH instead (they can unwrap later if needed)
  if (outputToken.symbol === 'ETH') {
    const uniswap = await Uniswap.getInstance(networkToUse);
    const wethToken = uniswap.getTokenBySymbol('WETH');

    if (!wethToken) {
      throw new Error('WETH token not found');
    }

    actualOutputToken = wethToken;
    logger.info('ETH detected as output token, will use WETH instead');
  }

  return { wrapTxHash, actualInputToken, actualOutputToken, actualInputAmount };
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';

  try {
    firstWalletAddress =
      (await ethereum.getFirstWalletAddress()) || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Uniswap V2 AMM',
        tags: ['uniswap/amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
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
        } = request.body;
        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!baseToken || !quoteToken || !amount || !side) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(
            `Token not found: ${!baseTokenObj ? baseToken : quoteToken}`,
          );
        }

        // Find pool address if not provided
        let poolAddressToUse = requestedPoolAddress;
        if (!poolAddressToUse) {
          poolAddressToUse = await uniswap.findDefaultPool(
            baseToken,
            quoteToken,
            'amm',
          );
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Get the V2 pair
        const pair = await uniswap.getV2Pool(
          baseTokenObj,
          quoteTokenObj,
          poolAddressToUse,
        );
        if (!pair) {
          throw fastify.httpErrors.notFound(
            `Pool not found for ${baseToken}-${quoteToken}`,
          );
        }

        // Determine which token is being traded
        const exactIn = side === 'SELL';
        const [originalInputToken, originalOutputToken] = exactIn
          ? [baseTokenObj, quoteTokenObj]
          : [quoteTokenObj, baseTokenObj];

        // Convert amount to token units with decimals
        const originalInputAmount = CurrencyAmount.fromRawAmount(
          originalInputToken,
          Math.floor(
            amount * Math.pow(10, originalInputToken.decimals),
          ).toString(),
        );

        // Handle ETH->WETH wrapping if needed
        const {
          wrapTxHash,
          actualInputToken,
          actualOutputToken,
          actualInputAmount,
        } = await handleEthToWethWrapping(
          fastify,
          networkToUse,
          walletAddress,
          originalInputToken,
          originalOutputToken,
          originalInputAmount,
        );

        // Get the V2 pair with actual tokens (after potential WETH conversion)
        const actualPair = await uniswap.getV2Pool(
          actualInputToken,
          actualOutputToken,
          poolAddressToUse,
        );
        if (!actualPair) {
          throw fastify.httpErrors.notFound(
            `Pool not found for ${actualInputToken.symbol}-${actualOutputToken.symbol}`,
          );
        }

        // Create a route for the trade with actual tokens
        const route = new V2Route(
          [actualPair],
          actualInputToken,
          actualOutputToken,
        );

        // For BUY direction, we need a different approach
        let trade;
        if (exactIn) {
          // For SELL (exactIn), we use the input amount and EXACT_INPUT trade type
          trade = new V2Trade(route, actualInputAmount, TradeType.EXACT_INPUT);
          logger.info(
            `Created EXACT_INPUT trade with input amount: ${formatTokenAmount(actualInputAmount.quotient.toString(), actualInputToken.decimals)} ${actualInputToken.symbol}`,
          );
        } else {
          // For BUY (exactOut), we create an exact output amount and use EXACT_OUTPUT trade type
          const outputAmount = CurrencyAmount.fromRawAmount(
            actualOutputToken,
            Math.floor(
              amount * Math.pow(10, actualOutputToken.decimals),
            ).toString(),
          );

          logger.info(
            `Creating EXACT_OUTPUT trade with output amount: ${formatTokenAmount(outputAmount.quotient.toString(), actualOutputToken.decimals)} ${actualOutputToken.symbol}`,
          );

          trade = new V2Trade(route, outputAmount, TradeType.EXACT_OUTPUT);
        }

        // Calculate slippage-adjusted amounts
        const slippageTolerance = slippagePct
          ? new Percent(slippagePct, 100)
          : uniswap.getAllowedSlippage();

        // Get the router contract with signer
        const routerAddress =
          uniswap.config.uniswapV2RouterAddress(networkToUse);
        const router = new Contract(
          routerAddress,
          IUniswapV2Router02ABI.abi,
          wallet,
        );

        // Prepare the transaction parameters
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
        const path = trade.route.path.map((token) => token.address);

        // Get transaction gas settings
        logger.info(`Getting gas price for ${networkToUse} network`);

        // Get the gas price in GWEI and convert to wei
        const estimatedGasPrice = await ethereum.estimateGasPrice();
        const gasPrice = utils.parseUnits(estimatedGasPrice.toString(), 'gwei');

        logger.info(`Using estimated gas price: ${estimatedGasPrice} Gwei`);

        // We also need a high gas limit for safety
        const gasLimit = 500000; // Higher gas limit to ensure transaction completes
        logger.info(`Using gas limit: ${gasLimit}`);

        // Set up transaction options with higher gas price and limit
        const txOptions = {
          gasLimit: gasLimit,
          gasPrice: gasPrice,
          nonce: await wallet.getTransactionCount('pending'), // Explicitly set nonce to prevent conflicts
        };

        // Log transaction options for debugging
        logger.info(
          `Transaction options: ${JSON.stringify({
            gasLimit: gasLimit.toString(),
            gasPrice: formatTokenAmount(gasPrice.toString(), 9) + ' Gwei',
            nonce: txOptions.nonce,
          })}`,
        );

        // Check allowance for input token (all are now ERC20 tokens after potential wrapping)
        const tokenContract = ethereum.getContract(
          actualInputToken.address,
          wallet,
        );
        const allowance = await ethereum.getERC20Allowance(
          tokenContract,
          wallet,
          routerAddress,
          actualInputToken.decimals,
        );

        const amountNeeded = exactIn
          ? actualInputAmount.quotient.toString()
          : trade.maximumAmountIn(slippageTolerance).quotient.toString();
        const currentAllowance = BigNumber.from(allowance.value);

        logger.info(
          `Current allowance: ${formatTokenAmount(currentAllowance.toString(), actualInputToken.decimals)} ${actualInputToken.symbol}`,
        );
        logger.info(
          `Amount needed: ${formatTokenAmount(amountNeeded, actualInputToken.decimals)} ${actualInputToken.symbol}`,
        );

        // Check if allowance is sufficient
        if (currentAllowance.lt(amountNeeded)) {
          logger.error(`Insufficient allowance for ${actualInputToken.symbol}`);
          throw new Error(
            `Insufficient allowance for ${actualInputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded, actualInputToken.decimals)} ${actualInputToken.symbol} for the Uniswap router (${routerAddress})`,
          );
        } else {
          logger.info(
            `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), actualInputToken.decimals)} ${actualInputToken.symbol}`,
          );
        }

        // Execute the swap - now all tokens are ERC20, so we use generic swap functions
        let tx;
        if (exactIn) {
          // Swap exact tokens for tokens
          const amountOutMin = trade
            .minimumAmountOut(slippageTolerance)
            .quotient.toString();

          logger.info(`Executing swapExactTokensForTokens`);
          tx = await router.swapExactTokensForTokens(
            actualInputAmount.quotient.toString(),
            amountOutMin,
            path,
            walletAddress,
            deadline,
            txOptions,
          );
        } else {
          // Swap tokens for exact tokens
          const amountOut = trade.outputAmount.quotient.toString();
          const amountInMax = trade
            .maximumAmountIn(slippageTolerance)
            .quotient.toString();

          logger.info(
            `BUY direction - amountOut: ${amountOut}, amountInMax: ${amountInMax}`,
          );
          logger.info(`Executing swapTokensForExactTokens`);

          tx = await router.swapTokensForExactTokens(
            amountOut,
            amountInMax,
            path,
            walletAddress,
            deadline,
            txOptions,
          );
        }

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        // Calculate balance changes using actual tokens
        let totalInputSwapped, totalOutputSwapped;

        if (exactIn) {
          // For SELL (exactIn), we know the exact input amount
          totalInputSwapped = formatTokenAmount(
            actualInputAmount.quotient.toString(),
            actualInputToken.decimals,
          );

          totalOutputSwapped = formatTokenAmount(
            trade.outputAmount.quotient.toString(),
            actualOutputToken.decimals,
          );
        } else {
          // For BUY (exactOut), we know the exact output amount from the trade
          totalOutputSwapped = formatTokenAmount(
            trade.outputAmount.quotient.toString(),
            actualOutputToken.decimals,
          );

          totalInputSwapped = formatTokenAmount(
            trade.inputAmount.quotient.toString(),
            actualInputToken.decimals,
          );
        }

        logger.info(
          `Swap completed - Input: ${totalInputSwapped} ${actualInputToken.symbol}, Output: ${totalOutputSwapped} ${actualOutputToken.symbol}`,
        );

        const baseTokenBalanceChange =
          side === 'BUY' ? totalOutputSwapped : -totalInputSwapped;
        const quoteTokenBalanceChange =
          side === 'BUY' ? -totalInputSwapped : totalOutputSwapped;

        // Calculate gas fee
        const actualGasPrice = receipt.effectiveGasPrice;
        const actualGasUsed = receipt.gasUsed;
        const gasFee = formatTokenAmount(
          actualGasUsed.mul(actualGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        // Log the actual gas used vs what we estimated
        logger.info(
          `Gas used: ${actualGasUsed.toString()} (limit was ${gasLimit})`,
        );
        logger.info(
          `Gas price: ${formatTokenAmount(actualGasPrice.toString(), 9)} Gwei`,
        );
        logger.info(`Total gas fee: ${gasFee} ETH`);

        // Include both swap and wrap txHash in the response if applicable
        const txSignature = wrapTxHash
          ? `swap:${receipt.transactionHash},wrap:${wrapTxHash}`
          : receipt.transactionHash;

        return {
          signature: txSignature,
          totalInputSwapped,
          totalOutputSwapped,
          fee: gasFee,
          baseTokenBalanceChange,
          quoteTokenBalanceChange,
        };
      } catch (e) {
        logger.error(`Execute swap error: ${e.message}`);

        // Check specifically for TRANSACTION_REPLACED error
        if (e.code === 'TRANSACTION_REPLACED') {
          // Extract information about the replacement transaction
          const { replacement, hash, receipt } = e;

          logger.info(
            `Transaction was replaced. Checking replacement transaction status...`,
          );

          // If the replacement transaction was successful (status=1), we can use that instead
          if (receipt && receipt.status === 1) {
            logger.info(
              `Replacement transaction ${replacement.hash} was successful!`,
            );

            // The approval transaction succeeded, so we can return a special message
            if (replacement.data && replacement.data.startsWith('0x095ea7b3')) {
              // This is an approval transaction (0x095ea7b3 is the approval function selector)
              logger.info(
                `Replacement was an approval transaction. Please try the swap again.`,
              );

              const error = new Error(
                `Token approval succeeded. Please try the swap transaction again.`,
              );
              (error as any).statusCode = 400; // Bad request, needs retry
              (error as any).replacementTxHash = replacement.hash;
              throw error;
            }

            // This was a successful swap (not just an approval), but we don't have exact details
            // We'll provide a simplified receipt based on the transaction that succeeded
            const estimatedAmount = 'Unknown'; // We don't know the exact amounts
            const baseTokenBalanceChange = receipt.status === 1 ? 1 : 0; // Just indicate success
            const quoteTokenBalanceChange = receipt.status === 1 ? -1 : 0; // Just indicate success

            return {
              signature: replacement.hash,
              totalInputSwapped: estimatedAmount,
              totalOutputSwapped: estimatedAmount,
              fee: formatTokenAmount(
                receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
                18,
              ),
              baseTokenBalanceChange,
              quoteTokenBalanceChange,
            };
          }
        }

        // Special message for common errors
        let errorMessage = e.message;

        if (e.code === 'REPLACEMENT_UNDERPRICED') {
          errorMessage = `Transaction gas price too low. Please try again in a few minutes.`;
        } else if (e.code === 'TRANSACTION_REPLACED' && e.cancelled) {
          errorMessage = `Transaction was cancelled by a replacement. Please try again.`;
        } else if (e.code === 'NONCE_EXPIRED') {
          errorMessage = `Transaction nonce already used. Please try again.`;
        } else if (
          e.message.includes('nonce too low') ||
          e.message.includes('nonce has already been used')
        ) {
          errorMessage = `Transaction rejected - nonce already used. Please try again.`;
        } else if (e.message.includes('insufficient funds')) {
          errorMessage = `Insufficient funds for transaction.`;
        }

        // Create error object with status code for consistent response format
        const error = new Error(errorMessage);
        (error as any).statusCode = 500;
        throw error;
      }
    },
  );
};

export default executeSwapRoute;

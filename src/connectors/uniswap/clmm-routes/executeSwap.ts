import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import {
  SwapRouter,
  Route as V3Route,
  Trade as V3Trade,
} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

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
import { formatTokenAmount } from '../uniswap.utils';
import { getUniswapClmmQuote } from './quoteSwap';


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
        description: 'Execute a swap on Uniswap V3 CLMM',
        tags: ['uniswap/clmm'],
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

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          const ethereum = await Ethereum.getInstance(networkToUse);
          walletAddress = await ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
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

        // Extract trade and token information from quote
        const { trade, inputToken, outputToken } = quote;
        let wrapTxHash = null;
        let actualInputToken = inputToken;
        let actualOutputToken = outputToken;

        // Handle ETH->WETH wrapping if needed
        if (inputToken.symbol === 'ETH') {
          const wethToken = uniswap.getTokenBySymbol('WETH');
          if (!wethToken) {
            throw new Error('WETH token not found');
          }

          const amountInEth = formatTokenAmount(
            trade.inputAmount.quotient.toString(),
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
          actualInputToken = wethToken;

          logger.info(
            `Successfully wrapped ${amountInEth} ETH to WETH, transaction hash: ${wrapTxHash}`,
          );
        }

        // If user wants ETH as output, we're already using WETH from quote
        if (outputToken.symbol === 'ETH') {
          const wethToken = uniswap.getTokenBySymbol('WETH');
          if (!wethToken) {
            throw new Error('WETH token not found');
          }
          actualOutputToken = wethToken;
          logger.info('ETH detected as output token, will use WETH instead');
        }

        // Get swap parameters for V3 swap from the trade
        const slippageTolerance =
          slippagePct !== undefined
            ? new Percent(Math.floor(slippagePct * 100), 10000)
            : uniswap.getAllowedSlippage();

        const routerSwapParams = SwapRouter.swapCallParameters(trade, {
          slippageTolerance,
          recipient: walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
        });

        // Check allowance for input token (all are now ERC20 tokens after potential wrapping)
        const router =
          uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse);

        // Get token contract
        const tokenContract = ethereum.getContract(
          actualInputToken.address,
          wallet,
        );

        // Check existing allowance
        const allowance = await ethereum.getERC20Allowance(
          tokenContract,
          wallet,
          router,
          actualInputToken.decimals,
        );

        // Calculate required amount
        const amountNeeded =
          routerSwapParams.value && routerSwapParams.value !== '0'
            ? BigNumber.from(routerSwapParams.value)
            : BigNumber.from(trade.inputAmount.quotient.toString());

        const currentAllowance = BigNumber.from(allowance.value);

        logger.info(
          `Current allowance: ${formatTokenAmount(currentAllowance.toString(), actualInputToken.decimals)} ${actualInputToken.symbol}`,
        );
        logger.info(
          `Amount needed: ${formatTokenAmount(amountNeeded.toString(), actualInputToken.decimals)} ${actualInputToken.symbol}`,
        );

        // Check if allowance is sufficient
        if (currentAllowance.lt(amountNeeded)) {
          logger.error(`Insufficient allowance for ${actualInputToken.symbol}`);
          throw new Error(
            `Insufficient allowance for ${actualInputToken.symbol}. Please approve at least ${formatTokenAmount(amountNeeded.toString(), actualInputToken.decimals)} ${actualInputToken.symbol} for the Uniswap router (${router})`,
          );
        } else {
          logger.info(
            `Sufficient allowance exists: ${formatTokenAmount(currentAllowance.toString(), actualInputToken.decimals)} ${actualInputToken.symbol}`,
          );
        }

        // Execute the swap
        // In Uniswap V3, we use the SDK to generate the proper calldata
        // SwapRouter methods typically include:
        // - exactInput: For exact input swaps
        // - exactOutput: For exact output swaps

        // Use the parameters directly from the SDK
        const { value, calldata } = routerSwapParams;

        // Get the exact path from the trade to debug
        const pathAddresses = trade.swaps[0].route.tokenPath.map(t => t.address);
        const pathDescription = pathAddresses.join(' → ');
        logger.info(`Executing swap with path: ${pathDescription}`);
        logger.info(`Fee amount used: ${trade.swaps[0].route.pools[0].fee}`);
        logger.info(
          `Swap call to: ${uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse)}`,
        );
        logger.info(
          `Input amount: ${trade.inputAmount.toSignificant(6)} ${actualInputToken.symbol}`,
        );
        logger.info(
          `Expected output: ${trade.outputAmount.toSignificant(6)} ${actualOutputToken.symbol}`,
        );

        try {
          // Execute the swap using the calldata from the SDK
          // Send the value from SDK if ETH wrapping wasn't needed, otherwise 0
          const txValue = wrapTxHash ? '0' : (value || '0');

          logger.info(`Sending transaction with value: ${txValue}`);
          const tx = await wallet.sendTransaction({
            to: uniswap.config.uniswapV3SmartOrderRouterAddress(networkToUse),
            data: calldata,
            value: txValue,
            gasLimit: 350000, // V3 swaps use more gas
          });

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

          // Calculate amounts for input and output using actual tokens
          const totalInputSwapped = formatTokenAmount(
            trade.inputAmount.quotient.toString(),
            actualInputToken.decimals,
          );

          const totalOutputSwapped = formatTokenAmount(
            trade.outputAmount.quotient.toString(),
            actualOutputToken.decimals,
          );

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

          return {
            signature: txSignature,
            totalInputSwapped: totalInputSwapped,
            totalOutputSwapped: totalOutputSwapped,
            fee: gasFee,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
          };
        } catch (error) {
          logger.error(`Swap execution error: ${error.message}`);
          if (error.transaction) {
            logger.debug(
              `Transaction details: ${JSON.stringify(error.transaction)}`,
            );
          }
          if (error.receipt) {
            logger.debug(
              `Transaction receipt: ${JSON.stringify(error.receipt)}`,
            );
          }

          // Provide more detailed error messages for common issues
          if (wrapTxHash) {
            logger.error(
              `ETH was wrapped (tx: ${wrapTxHash}) but swap failed. This could be a problem with the swap itself.`,
            );
          }

          // Extract and log the specific error message
          const errorMessage = error.reason || error.message;
          throw new Error(`Failed to execute swap: ${errorMessage}`);
        }
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to execute swap');
      }
    },
  );
};

export default executeSwapRoute;
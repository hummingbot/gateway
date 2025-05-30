import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import {
  AlphaRouter,
  SwapOptions,
  SwapRoute,
  SwapType,
} from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { formatTokenAmount } from '../uniswap.utils';

// Removing the Protocol enum as it's causing type issues

/**
 * Get a swap quote for the given tokens and amount
 * This function can be reused by executeSwap to ensure consistent routing logic
 */
export async function getUniswapQuote(
  fastify: FastifyInstance,
  network: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  recipient: string = ethers.constants.AddressZero, // Default to zero address for quote
) {
  // Get Uniswap and Ethereum instances
  const ethereum = await Ethereum.getInstance(network);

  // Add debug logging for chainId
  logger.info(`Network: ${network}, Chain ID: ${ethereum.chainId}`);

  // Resolve tokens using Ethereum class
  const baseTokenInfo = ethereum.getTokenBySymbol(baseTokenSymbol);
  const quoteTokenInfo = ethereum.getTokenBySymbol(quoteTokenSymbol);

  // Log token resolution results
  logger.info(
    `Base token (${baseTokenSymbol}) info: ${JSON.stringify(baseTokenInfo)}`,
  );
  logger.info(
    `Quote token (${quoteTokenSymbol}) info: ${JSON.stringify(quoteTokenInfo)}`,
  );

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      `Token not found: ${!baseTokenInfo ? baseTokenSymbol : quoteTokenSymbol}`,
    );
  }

  // Convert to Uniswap SDK Token objects
  const baseToken = new Token(
    ethereum.chainId,
    baseTokenInfo.address,
    baseTokenInfo.decimals,
    baseTokenInfo.symbol,
    baseTokenInfo.name,
  );

  const quoteToken = new Token(
    ethereum.chainId,
    quoteTokenInfo.address,
    quoteTokenInfo.decimals,
    quoteTokenInfo.symbol,
    quoteTokenInfo.name,
  );

  // Determine which token is being traded
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn
    ? [baseToken, quoteToken]
    : [quoteToken, baseToken];

  // Convert amount to token units with decimals - ensure proper precision
  // For BUY orders with USDC as input, we need to ensure proper decimal handling
  const scaleFactor = Math.pow(10, inputToken.decimals);
  const scaledAmount = amount * scaleFactor;
  const rawAmount = Math.floor(scaledAmount).toString();

  logger.info(
    `Amount conversion for ${inputToken.symbol} (decimals: ${inputToken.decimals}): ${amount} -> ${scaledAmount} -> ${rawAmount}`,
  );
  const inputAmount = CurrencyAmount.fromRawAmount(inputToken, rawAmount);

  // Calculate slippage tolerance
  const slippageTolerance = slippagePct
    ? new Percent(Math.floor(slippagePct * 100), 10000) // Convert to basis points
    : new Percent(50, 10000); // 0.5% default slippage

  // Initialize AlphaRouter for optimal routing
  const alphaRouter = new AlphaRouter({
    chainId: ethereum.chainId,
    provider: ethereum.provider as ethers.providers.JsonRpcProvider,
  });

  // Create options for the router with the required SwapOptions format
  const swapOptions: SwapOptions = {
    type: SwapType.SWAP_ROUTER_02, // Explicitly use SwapRouter02
    recipient, // Add recipient from parameter
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
  };

  // Log the parameters being sent to the alpha router
  logger.info(`Alpha router params:
  - Input token: ${inputToken.symbol} (${inputToken.address})
  - Output token: ${outputToken.symbol} (${outputToken.address})
  - Input amount: ${inputAmount.toExact()} (${rawAmount} in raw units)
  - Trade type: ${exactIn ? 'EXACT_INPUT' : 'EXACT_OUTPUT'}
  - Slippage tolerance: ${slippageTolerance.toFixed(2)}%
  - Chain ID: ${ethereum.chainId}`);

  // Generate the route using AlphaRouter
  // Add extra validation to ensure tokens are correctly formed
  // Simple logging, similar to v2.2.0
  logger.info(
    `Converting amount for ${inputToken.symbol} (decimals: ${inputToken.decimals}): ${amount} -> ${inputAmount.toExact()} -> ${rawAmount}`,
  );

  let route;
  try {
    // Following similar approach to v2.2.0 - simpler configuration
    logger.info(
      `Fetching trade data for ${baseToken.address}-${quoteToken.address}`,
    );

    // Only support mainnet for alpha router routes
    if (network !== 'mainnet') {
      throw fastify.httpErrors.badRequest(
        `Alpha router quotes are only supported on mainnet. Current network: ${network}`,
      );
    }

    // For mainnet, just eliminate splits which seems to be causing issues
    const routingConfig = {
      maxSplits: 0, // Disable splits for simplicity
      distributionPercent: 100, // Use 100% for a single route
    };

    route = await alphaRouter.route(
      inputAmount,
      outputToken,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
      swapOptions,
      routingConfig,
    );
  } catch (routeError) {
    // Simple error logging like v2.2.0
    logger.error(
      `Failed to get route for ${baseToken.symbol}-${quoteToken.symbol}: ${routeError.message}`,
    );
    throw fastify.httpErrors.badRequest(
      `No route found for ${baseToken.symbol}-${quoteToken.symbol}`,
    );
  }

  if (!route) {
    logger.error(
      `Alpha router returned null for ${baseTokenSymbol}-${quoteTokenSymbol} on network ${network}`,
    );
    throw fastify.httpErrors.badRequest(
      `Could not find a route for ${baseTokenSymbol}-${quoteTokenSymbol} on network ${network}`,
    );
  }

  // Log route details
  logger.info(
    `Route generation successful - has method parameters: ${!!route.methodParameters}`,
  );

  // Simple route logging, similar to v2.2.0
  logger.info(
    `Best trade for ${baseToken.address}-${quoteToken.address}: ${route.quote.toExact()}${outputToken.symbol}.`,
  );

  // Calculate amounts
  let estimatedAmountIn, estimatedAmountOut;

  // For SELL (exactIn), we know the exact input amount, output is estimated
  if (exactIn) {
    estimatedAmountIn = Number(
      formatTokenAmount(inputAmount.quotient.toString(), inputToken.decimals),
    );

    estimatedAmountOut = Number(
      formatTokenAmount(route.quote.quotient.toString(), outputToken.decimals),
    );
  }
  // For BUY (exactOut), the output is exact, input is estimated
  else {
    estimatedAmountOut = Number(
      formatTokenAmount(inputAmount.quotient.toString(), outputToken.decimals),
    );

    estimatedAmountIn = Number(
      formatTokenAmount(route.quote.quotient.toString(), inputToken.decimals),
    );
  }

  // Calculate min/max values with slippage
  const minAmountOut = exactIn
    ? estimatedAmountOut * (1 - (slippagePct || 0.5) / 100)
    : estimatedAmountOut;
  const maxAmountIn = exactIn
    ? estimatedAmountIn
    : estimatedAmountIn * (1 + (slippagePct || 0.5) / 100);

  // Calculate price based on side
  // For SELL: price = quote received / base sold
  // For BUY: price = quote needed / base received
  const price =
    side === 'SELL'
      ? estimatedAmountOut / estimatedAmountIn
      : estimatedAmountIn / estimatedAmountOut;

  // Calculate balance changes
  const baseTokenBalanceChange =
    side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
  const quoteTokenBalanceChange =
    side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

  // Get gas estimate
  const gasLimit = route.estimatedGasUsed?.toNumber() || 350000;
  const gasPrice = await ethereum.estimateGasPrice(); // Use ethereum's estimateGasPrice method
  const gasCost = gasPrice * gasLimit * 1e-9; // Convert to ETH

  return {
    route,
    baseToken,
    quoteToken,
    inputToken,
    outputToken,
    inputAmount,
    exactIn,
    estimatedAmountIn,
    estimatedAmountOut,
    minAmountOut,
    maxAmountIn,
    price,
    slippageTolerance, // Include this for calculations even though we don't pass it to the router
    baseTokenBalanceChange,
    quoteTokenBalanceChange,
    gasPrice,
    gasLimit,
    gasCost,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify, _options) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('mainnet');
  let firstWalletAddress = '<ethereum-wallet-address>';

  try {
    firstWalletAddress =
      (await ethereum.getFirstWalletAddress()) || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description:
          'Get a swap quote using Uniswap AlphaRouter (mainnet only)',
        tags: ['uniswap'],
        querystring: {
          type: 'object',
          properties: {
            network: { type: 'string', default: 'mainnet', enum: ['mainnet'] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] },
          },
          required: ['baseToken', 'quoteToken', 'amount', 'side'],
        },
        response: {
          200: GetSwapQuoteResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        // Log the request parameters for debugging
        logger.info(
          `Received quote-swap request: ${JSON.stringify(request.query)}`,
        );

        const {
          network,
          baseToken: baseTokenSymbol,
          quoteToken: quoteTokenSymbol,
          amount,
          side,
          slippagePct,
        } = request.query;

        const networkToUse = network || 'mainnet';

        // Validate essential parameters
        if (!baseTokenSymbol || !quoteTokenSymbol || !amount || !side) {
          logger.error('Missing required parameters in request');
          return reply.badRequest('Missing required parameters');
        }

        try {
          // Use our shared quote function
          const quoteResult = await getUniswapQuote(
            fastify,
            networkToUse,
            baseTokenSymbol,
            quoteTokenSymbol,
            amount,
            side as 'BUY' | 'SELL',
            slippagePct,
          );

          // Return only the data needed for the API response
          return {
            estimatedAmountIn: quoteResult.estimatedAmountIn,
            estimatedAmountOut: quoteResult.estimatedAmountOut,
            minAmountOut: quoteResult.minAmountOut,
            maxAmountIn: quoteResult.maxAmountIn,
            price: quoteResult.price,
            baseTokenBalanceChange: quoteResult.baseTokenBalanceChange,
            quoteTokenBalanceChange: quoteResult.quoteTokenBalanceChange,
            gasPrice: quoteResult.gasPrice,
            gasLimit: quoteResult.gasLimit,
            gasCost: quoteResult.gasCost,
          };
        } catch (error) {
          // If the error already has a status code, it's a Fastify HTTP error
          if (error.statusCode) {
            throw error;
          }

          // Log more detailed information about the error
          logger.error(`Router error: ${error.message}`);
          if (error.stack) {
            logger.debug(`Error stack: ${error.stack}`);
          }

          // Check if there's any additional error details
          if (error.innerError) {
            logger.error(`Inner error: ${JSON.stringify(error.innerError)}`);
          }

          // Check if it's a specific error type from the Alpha Router
          if (error.name === 'SwapRouterError') {
            logger.error(`SwapRouterError details: ${JSON.stringify(error)}`);
          }

          return reply.badRequest(
            `Failed to get quote with router: ${error.message}`,
          );
        }
      } catch (e) {
        logger.error(`Quote swap error: ${e.message}`);
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }
        return reply.internalServerError(`Failed to get quote: ${e.message}`);
      }
    },
  );
};

export default quoteSwapRoute;

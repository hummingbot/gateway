import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import {
  AlphaRouter,
  SwapOptions,
  SwapRoute,
  SwapType,
} from '@uniswap/smart-order-router';
import { ethers, BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
} from '../../../schemas/swap-schema';
import { ConfigManagerV2 } from '../../../services/config-manager-v2';
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
  // For BUY orders, amount represents the desired output (baseToken to buy)
  // For SELL orders, amount represents the input (baseToken to sell)
  let tradeAmount;
  if (exactIn) {
    // SELL: amount is the input amount (baseToken)
    const scaleFactor = Math.pow(10, inputToken.decimals);
    const scaledAmount = amount * scaleFactor;
    const rawAmount = Math.floor(scaledAmount).toString();
    logger.info(
      `SELL - Amount conversion for ${inputToken.symbol} (decimals: ${inputToken.decimals}): ${amount} -> ${scaledAmount} -> ${rawAmount}`,
    );
    tradeAmount = CurrencyAmount.fromRawAmount(inputToken, rawAmount);

    // Debug: Verify the tradeAmount was created correctly
    logger.info(`SELL - tradeAmount verification:
    - toExact(): ${tradeAmount.toExact()}
    - quotient: ${tradeAmount.quotient.toString()}
    - currency.symbol: ${tradeAmount.currency.symbol}
    - currency.address: ${tradeAmount.currency.address}`);
  } else {
    // BUY: amount is the desired output amount (baseToken to buy)
    const scaleFactor = Math.pow(10, outputToken.decimals);
    const scaledAmount = amount * scaleFactor;
    const rawAmount = Math.floor(scaledAmount).toString();
    logger.info(
      `BUY - Amount conversion for ${outputToken.symbol} (decimals: ${outputToken.decimals}): ${amount} -> ${scaledAmount} -> ${rawAmount}`,
    );
    tradeAmount = CurrencyAmount.fromRawAmount(outputToken, rawAmount);

    // Debug: Verify the tradeAmount was created correctly
    logger.info(`BUY - tradeAmount verification:
    - toExact(): ${tradeAmount.toExact()}
    - quotient: ${tradeAmount.quotient.toString()}
    - currency.symbol: ${tradeAmount.currency.symbol}
    - currency.address: ${tradeAmount.currency.address}`);
  }

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
    deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
  };

  // Log the parameters being sent to the alpha router
  logger.info(`Alpha router params:
  - Input token: ${inputToken.symbol} (${inputToken.address})
  - Output token: ${outputToken.symbol} (${outputToken.address})
  - Trade amount: ${tradeAmount.toExact()} ${exactIn ? inputToken.symbol : outputToken.symbol}
  - Trade type: ${exactIn ? 'EXACT_INPUT' : 'EXACT_OUTPUT'}
  - Slippage tolerance: ${slippageTolerance.toFixed(2)}%
  - Chain ID: ${ethereum.chainId}`);

  // Generate the route using AlphaRouter
  // Add extra validation to ensure tokens are correctly formed
  // Simple logging, similar to v2.2.0
  logger.info(
    `Converting amount for ${exactIn ? inputToken.symbol : outputToken.symbol} (decimals: ${exactIn ? inputToken.decimals : outputToken.decimals}): ${amount} -> ${tradeAmount.toExact()}`,
  );

  let route;
  try {
    // Following similar approach to v2.2.0 - simpler configuration
    logger.info(
      `Fetching trade data for ${baseToken.address}-${quoteToken.address}`,
    );

    // Log the network being used
    logger.info(`Using AlphaRouter for network: ${network}`);

    // Let the AlphaRouter use its default configuration
    // This will automatically select the best pools based on liquidity and price

    // For EXACT_OUTPUT, we need to specify the currency we want to receive
    // The tradeAmount should be the output currency amount
    const currencyAmount = tradeAmount;
    const otherCurrency = exactIn ? outputToken : inputToken;

    logger.info(`Calling alphaRouter.route with:
    - currencyAmount: ${currencyAmount.toExact()} ${currencyAmount.currency.symbol}
    - otherCurrency: ${otherCurrency.symbol}
    - tradeType: ${exactIn ? 'EXACT_INPUT' : 'EXACT_OUTPUT'}`);

    // Debug the raw values being passed
    logger.info(
      `Debug currencyAmount raw: ${currencyAmount.quotient.toString()}`,
    );

    route = await alphaRouter.route(
      currencyAmount,
      otherCurrency,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
      swapOptions,
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

  // Log pool selection details to debug fee tier issues
  if (route.route && route.route.length > 0) {
    route.route.forEach((pool, index) => {
      if ('fee' in pool) {
        logger.info(
          `Route pool ${index + 1}: ${pool.token0.symbol}/${pool.token1.symbol} - Fee: ${pool.fee} (${pool.fee / 10000}%)`,
        );
      }
    });
  }

  // Debug: Log the methodParameters for all orders
  if (route.methodParameters) {
    logger.info(`${side} order methodParameters:
    - calldata length: ${route.methodParameters.calldata.length}
    - value: ${route.methodParameters.value}
    - to: ${route.methodParameters.to}`);

    // Try to decode the calldata to see what function is being called
    const calldataHex = route.methodParameters.calldata;
    const functionSelector = calldataHex.slice(0, 10);
    logger.info(`Function selector in calldata: ${functionSelector}`);

    // Common Uniswap V3 function selectors:
    // 0x5ae401dc = multicall(uint256 deadline, bytes[] data)
    // 0x5023b4df = exactInputSingle
    // 0xdb3e2198 = exactOutputSingle

    // The amount should be somewhere in the calldata
    if (calldataHex.length > 200 && functionSelector === '0x5ae401dc') {
      // This is a multicall, need to decode the inner call
      // For multicall(deadline, bytes[] data), the actual swap function is deeper in the calldata
      // Let's trace through the calldata structure

      // Multicall parameters:
      // 0x5ae401dc = multicall selector (4 bytes = 8 hex chars)
      // deadline (32 bytes = 64 hex chars) starts at position 8
      // offset to data array (32 bytes = 64 hex chars) starts at position 72

      const deadline = '0x' + calldataHex.slice(8, 72);
      logger.info(`Deadline: ${parseInt(deadline, 16)}`);

      // The actual swap data starts later in the calldata
      // Look for common swap function selectors in the data
      const exactInputSingleSelector = '04e45aaf';
      const exactOutputSingleSelector = 'db3e2198';

      const exactInputPos = calldataHex.indexOf(exactInputSingleSelector);
      const exactOutputPos = calldataHex.indexOf(exactOutputSingleSelector);

      if (exactInputPos > -1) {
        logger.info(`Found exactInputSingle at position ${exactInputPos}`);
        const innerFunctionSelector =
          '0x' + calldataHex.slice(exactInputPos, exactInputPos + 8);
        logger.info(`Inner function selector: ${innerFunctionSelector}`);

        if (innerFunctionSelector === '0x04e45aaf') {
          // exactInputSingle structure:
          // tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96
          // Each param is 32 bytes (64 hex chars)

          const paramStart = exactInputPos + 8; // Skip function selector
          let offset = paramStart;

          const tokenIn = '0x' + calldataHex.slice(offset + 24, offset + 64);
          offset += 64;
          const tokenOut = '0x' + calldataHex.slice(offset + 24, offset + 64);
          offset += 64;
          const fee = parseInt(
            '0x' + calldataHex.slice(offset + 56, offset + 64),
            16,
          );
          offset += 64;
          const recipient = '0x' + calldataHex.slice(offset + 24, offset + 64);
          offset += 64;
          const amountInHex = '0x' + calldataHex.slice(offset, offset + 64);
          offset += 64;
          const minAmountOutHex = '0x' + calldataHex.slice(offset, offset + 64);

          logger.info(`exactInputSingle parameters:
          - tokenIn: ${tokenIn}
          - tokenOut: ${tokenOut}  
          - fee: ${fee} (${fee / 10000}%)
          - recipient: ${recipient}
          - amountIn: ${amountInHex} = ${BigNumber.from(amountInHex).toString()}
          - minAmountOut: ${minAmountOutHex} = ${BigNumber.from(minAmountOutHex).toString()}`);

          // Check the actual amount being swapped
          const amountInWei = BigNumber.from(amountInHex);
          const amountInEther = Number(
            formatTokenAmount(amountInWei.toString(), 18),
          );
          logger.info(`Amount being swapped: ${amountInEther} WETH`);

          if (amountInEther === 0) {
            logger.error(`CRITICAL: Swap amount is 0 WETH!`);
          }

          if (exactIn) {
            logger.info(`SELL order using exactInputSingle (expected)`);
          } else {
            logger.warn(
              `BUY order is using exactInputSingle instead of exactOutputSingle!`,
            );
          }
        }
      } else if (exactOutputPos > -1) {
        logger.info(`Found exactOutputSingle at position ${exactOutputPos}`);
        const innerFunctionSelector =
          '0x' + calldataHex.slice(exactOutputPos, exactOutputPos + 8);
        logger.info(`Inner function selector: ${innerFunctionSelector}`);
      }
    }

    // Log the trade details from the route
    if (route.trade) {
      logger.info(`Route trade details:
      - inputAmount: ${route.trade.inputAmount.toExact()} ${route.trade.inputAmount.currency.symbol}
      - outputAmount: ${route.trade.outputAmount.toExact()} ${route.trade.outputAmount.currency.symbol}
      - tradeType: ${route.trade.tradeType}`);
    }
  }

  // Simple route logging, similar to v2.2.0
  logger.info(
    `Best trade for ${baseToken.address}-${quoteToken.address}: ${route.quote.toExact()} ${exactIn ? outputToken.symbol : inputToken.symbol}`,
  );

  // Additional debug logging for BUY orders
  if (!exactIn) {
    logger.info(
      `BUY order debug - tradeAmount: ${tradeAmount.toExact()} ${outputToken.symbol}, route.quote: ${route.quote.toExact()} ${inputToken.symbol}`,
    );
  }

  // Calculate amounts
  let estimatedAmountIn, estimatedAmountOut;

  // For SELL (exactIn), we know the exact input amount, output is estimated
  if (exactIn) {
    estimatedAmountIn = Number(
      formatTokenAmount(tradeAmount.quotient.toString(), inputToken.decimals),
    );

    estimatedAmountOut = Number(
      formatTokenAmount(route.quote.quotient.toString(), outputToken.decimals),
    );
  }
  // For BUY (exactOut), the output is exact, input is estimated
  else {
    estimatedAmountOut = Number(
      formatTokenAmount(tradeAmount.quotient.toString(), outputToken.decimals),
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

  // Use fixed gas limit for Uniswap V3 swaps
  const gasLimit = 300000;
  logger.info(`Gas limit: using fixed ${gasLimit} for Uniswap V3 swap`);

  const gasPrice = await ethereum.estimateGasPrice(); // Use ethereum's estimateGasPrice method
  logger.info(`Gas price: ${gasPrice} GWEI from ethereum.estimateGasPrice()`);

  const gasCost = gasPrice * gasLimit * 1e-9; // Convert to ETH

  return {
    route,
    baseToken,
    quoteToken,
    inputToken,
    outputToken,
    tradeAmount,
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
  const firstWalletAddress = await Ethereum.getWalletAddressExample();

  // Get available networks from Ethereum configuration (same method as chain.routes.ts)
  const ethereumNetworks = Object.keys(
    ConfigManagerV2.getInstance().get('ethereum.networks') || {},
  );

  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote using Uniswap AlphaRouter',
        tags: ['uniswap'],
        querystring: {
          type: 'object',
          properties: {
            network: {
              type: 'string',
              default: 'mainnet',
              enum: ethereumNetworks,
            },
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

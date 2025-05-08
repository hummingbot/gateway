import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType
} from '../../../schemas/trading-types/swap-schema';
import { formatTokenAmount } from '../uniswap.utils';
import {
  Token,
  CurrencyAmount,
  Percent,
  TradeType,
} from '@uniswap/sdk-core';
import { AlphaRouter, SwapType, SwapOptions } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import JSBI from 'jsbi';

export const quoteSwapRoute: FastifyPluginAsync = async (fastify, _options) => {
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';
  
  try {
    firstWalletAddress = await ethereum.getFirstWalletAddress() || firstWalletAddress;
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
        description: 'Get a swap quote using Uniswap AlphaRouter',
        tags: ['uniswap'],
        querystring: {
          type: 'object',
          properties: {
            network: { type: 'string', default: 'base' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] }
          },
          required: ['baseToken', 'quoteToken', 'amount', 'side']
        },
        response: {
          200: GetSwapQuoteResponse
        }
      }
    },
    async (request, reply) => {
      try {
        // Log the request parameters for debugging
        logger.info(`Received quote-swap request: ${JSON.stringify(request.query)}`);
        
        const { 
          network, 
          baseToken: baseTokenSymbol, 
          quoteToken: quoteTokenSymbol, 
          amount, 
          side, 
          slippagePct 
        } = request.query;
        
        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!baseTokenSymbol || !quoteTokenSymbol || !amount || !side) {
          logger.error('Missing required parameters in request');
          return reply.badRequest('Missing required parameters');
        }
        
        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);
        
        // Resolve tokens using Ethereum class
        const baseTokenInfo = ethereum.getTokenBySymbol(baseTokenSymbol);
        const quoteTokenInfo = ethereum.getTokenBySymbol(quoteTokenSymbol);
        
        // Convert to Uniswap SDK Token objects
        const baseToken = baseTokenInfo ? new Token(
          ethereum.chainId,
          baseTokenInfo.address,
          baseTokenInfo.decimals,
          baseTokenInfo.symbol,
          baseTokenInfo.name
        ) : null;
        
        const quoteToken = quoteTokenInfo ? new Token(
          ethereum.chainId,
          quoteTokenInfo.address,
          quoteTokenInfo.decimals,
          quoteTokenInfo.symbol,
          quoteTokenInfo.name
        ) : null;

        if (!baseToken || !quoteToken) {
          logger.error(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
          return reply.badRequest(`Token not found: ${!baseToken ? baseTokenSymbol : quoteTokenSymbol}`);
        }

        // Determine which token is being traded
        const exactIn = side === 'SELL';
        const [inputToken, outputToken] = exactIn 
          ? [baseToken, quoteToken] 
          : [quoteToken, baseToken];

        // Convert amount to token units with decimals
        const inputAmount = CurrencyAmount.fromRawAmount(
          inputToken,
          JSBI.BigInt(Math.floor(amount * Math.pow(10, inputToken.decimals)).toString())
        );

        try {
          // Log information about this request for debugging
          logger.info(`Getting quote for ${exactIn ? 'selling' : 'buying'} ${inputToken.symbol}/${outputToken.symbol}`);
          logger.info(`Input amount: ${formatTokenAmount(inputAmount.quotient.toString(), inputToken.decimals)} ${inputToken.symbol}`);
          logger.info(`Slippage tolerance: ${slippagePct || 0.5}%`);
          
          // Initialize AlphaRouter for optimal routing
          const alphaRouter = new AlphaRouter({
            chainId: ethereum.chainId,
            provider: ethereum.provider as ethers.providers.JsonRpcProvider,
          });

          // Generate a swap route - using TypeScript-compliant approach
          const swapOptions: SwapOptions = {
            recipient: ethers.constants.AddressZero, // Dummy recipient for quote
            slippageTolerance: slippagePct ? 
              new Percent(Math.floor(slippagePct * 100), 10000) : 
              new Percent(50, 10000), // 0.5% default slippage
            deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
            type: SwapType.SWAP_ROUTER_02 // Required by TypeScript typing
          };
            
          // Generate a swap route
          const route = await alphaRouter.route(
            inputAmount,
            outputToken,
            exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
            swapOptions,
            {
              maxSwapsPerPath: uniswap.config.maximumHops || 4
            }
          );

          if (!route) {
            logger.error(`Could not find a route for ${baseTokenSymbol}-${quoteTokenSymbol}`);
            return reply.badRequest(`Could not find a route for ${baseTokenSymbol}-${quoteTokenSymbol}`);
          }

          // Get expected and estimated amounts
          let estimatedAmountIn, estimatedAmountOut;
          
          // For SELL (exactIn), we know the exact input amount, output is estimated
          if (exactIn) {
            estimatedAmountIn = Number(formatTokenAmount(
              inputAmount.quotient.toString(),
              inputToken.decimals
            ));
            
            estimatedAmountOut = Number(formatTokenAmount(
              route.quote.quotient.toString(),
              outputToken.decimals
            ));
          } 
          // For BUY (exactOut), the output is exact, input is estimated
          else {
            estimatedAmountOut = Number(formatTokenAmount(
              inputAmount.quotient.toString(),
              outputToken.decimals
            ));
            
            estimatedAmountIn = Number(formatTokenAmount(
              route.quote.quotient.toString(), 
              inputToken.decimals
            ));
          }

          // Calculate min/max values
          const minAmountOut = exactIn ? estimatedAmountOut * (1 - (slippagePct || 0.5) / 100) : estimatedAmountOut;
          const maxAmountIn = exactIn ? estimatedAmountIn : estimatedAmountIn * (1 + (slippagePct || 0.5) / 100);

          // Calculate price
          const price = estimatedAmountOut / estimatedAmountIn;

          // Prepare balance changes
          const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
          const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

          // Get gas estimate from the route if available
          const gasLimit = route.estimatedGasUsed?.toNumber() || 350000;
          const gasPrice = parseFloat(ethers.utils.formatUnits(await ethereum.provider.getGasPrice(), 'gwei'));
          const gasCost = gasPrice * gasLimit * 1e-9; // Convert to ETH

          // Store route in app state for later use in execute-swap
          const cacheKey = `${networkToUse}-${baseTokenSymbol}-${quoteTokenSymbol}-${amount}-${side}`;
          const cacheObj = {
            route,
            timestamp: Date.now(),
            // Cache expires after 2 minutes
            expiresAt: Date.now() + 120000
          };
          
          // Check if decoration already exists
          const decoratorKey = `uniswapRouteCache_${cacheKey}`;
          try {
            if (fastify.hasDecorator(decoratorKey)) {
              // If it exists, update it
              fastify[decoratorKey] = cacheObj;
              logger.info(`Updated cached route for key: ${cacheKey}`);
            } else {
              // Otherwise create it
              fastify.decorate(decoratorKey, cacheObj);
              logger.info(`Created new cached route for key: ${cacheKey}`);
            }
          } catch (error) {
            // Handle any decorator errors
            logger.warn(`Failed to cache route, will regenerate in execute: ${error.message}`);
          }

          // Log success
          logger.info(`Generated quote successfully for ${side} of ${amount} ${baseTokenSymbol} for ${quoteTokenSymbol}`);
          logger.info(`Estimated price: ${price}, min amount out: ${minAmountOut}, gas: ${gasLimit}`);

          return {
            estimatedAmountIn,
            estimatedAmountOut,
            minAmountOut,
            maxAmountIn,
            price,
            baseTokenBalanceChange,
            quoteTokenBalanceChange,
            gasPrice,
            gasLimit,
            gasCost
          };
        } catch (error) {
          logger.error(`Router error: ${error.message}`);
          if (error.stack) {
            logger.debug(`Error stack: ${error.stack}`);
          }
          return reply.badRequest(`Failed to get quote with router: ${error.message}`);
        }
      } catch (e) {
        logger.error(`Quote swap error: ${e.message}`);
        if (e.stack) {
          logger.debug(`Error stack: ${e.stack}`);
        }
        return reply.internalServerError(`Failed to get quote: ${e.message}`);
      }
    }
  );
};

export default quoteSwapRoute;
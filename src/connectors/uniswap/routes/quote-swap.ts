import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest
} from '../../../schemas/trading-types/swap-schema';
import { formatTokenAmount } from '../uniswap.utils';
import {
  Token,
  CurrencyAmount,
  Percent,
  TradeType,
} from '@uniswap/sdk-core';
import { AlphaRouter, SwapType, SwapRoute } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';
import JSBI from 'jsbi';

/**
 * Get a Universal Router quote using AlphaRouter with SwapType.SWAP_ROUTER_02
 * 
 * NOTE: We use SwapType.SWAP_ROUTER_02 instead of UNIVERSAL_ROUTER because of
 * compatibility issues between the SDK versions. The calldata generated
 * with SwapType.SWAP_ROUTER_02 can be sent to the Universal Router address,
 * which is what we do in execute-swap.ts.
 */
export async function getUniversalRouterQuote(
  ethereum: Ethereum,
  inputToken: Token,
  outputToken: Token,
  inputAmount: CurrencyAmount<Token>,
  exactIn: boolean,
  slippageTolerance: Percent
): Promise<SwapRoute> {
  // Log information about this request for debugging
  logger.info(`Getting quote for ${exactIn ? 'selling' : 'buying'} ${inputToken.symbol}/${outputToken.symbol}`);
  logger.info(`Input amount: ${formatTokenAmount(inputAmount.quotient.toString(), inputToken.decimals)} ${inputToken.symbol}`);
  logger.info(`Slippage tolerance: ${slippageTolerance.toFixed(2)}%`);
  
  try {
    // Use AlphaRouter to find optimal routes
    const alphaRouter = new AlphaRouter({
      chainId: ethereum.chainId,
      provider: ethereum.provider as ethers.providers.JsonRpcProvider,
    });

    // Generate a swap route using AlphaRouter with SWAP_ROUTER_02 type
    const route = await alphaRouter.route(
      inputAmount,
      outputToken,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
      {
        recipient: ethers.constants.AddressZero, // Dummy recipient for quote
        slippageTolerance,
        // Use SWAP_ROUTER_02 type for compatibility - the calldata will be sent to Universal Router later
        type: SwapType.SWAP_ROUTER_02,
        deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
      }
    );

    if (!route) {
      logger.error(`Could not find a route between ${inputToken.symbol} and ${outputToken.symbol}`);
      throw new Error(`Could not find a route between ${inputToken.symbol} and ${outputToken.symbol}`);
    }

    // Log success for debugging
    logger.info(`Found route with ${route.route.length} paths`);
    logger.info(`Quote amount: ${formatTokenAmount(route.quote.quotient.toString(), outputToken.decimals)} ${outputToken.symbol}`);
    
    return route;
  } catch (error) {
    // Log detailed error info
    logger.error(`Error getting quote: ${error.message}`);
    if (error.stack) {
      logger.debug(`Error stack: ${error.stack}`);
    }
    throw error;
  }
}

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
        description: 'Get a swap quote using Uniswap Universal Router',
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
        
        // Resolve tokens
        const baseToken = uniswap.getTokenBySymbol(baseTokenSymbol);
        const quoteToken = uniswap.getTokenBySymbol(quoteTokenSymbol);

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
          // Calculate slippage tolerance
          const slippageTolerance = slippagePct ? 
            new Percent(Math.floor(slippagePct * 100), 10000) : 
            new Percent(50, 10000); // 0.5% default slippage
          
          // Generate a Universal Router quote with enhanced logging
          logger.info(`Generating quote for ${side} of ${amount} ${baseTokenSymbol} for ${quoteTokenSymbol} on ${networkToUse}`);
          
          const route = await getUniversalRouterQuote(
            ethereum,
            inputToken,
            outputToken,
            inputAmount,
            exactIn,
            slippageTolerance
          );

          // Calculate estimated amounts
          const estimatedAmountIn = Number(formatTokenAmount(
            exactIn ? inputAmount.quotient.toString() : route.quote.quotient.toString(),
            inputToken.decimals
          ));
          
          const estimatedAmountOut = Number(formatTokenAmount(
            exactIn ? route.quote.quotient.toString() : inputAmount.quotient.toString(),
            outputToken.decimals
          ));

          // Calculate min/max values with slippage
          const slippageNumber = slippagePct ? slippagePct / 100 : 0.005; // 0.5% default
          const minAmountOut = exactIn ? 
            estimatedAmountOut * (1 - slippageNumber) : 
            estimatedAmountOut;
          
          const maxAmountIn = exactIn ? 
            estimatedAmountIn : 
            estimatedAmountIn * (1 + slippageNumber);

          // Calculate price
          const price = estimatedAmountOut / estimatedAmountIn;
          
          // Get gas estimate (default value if not available)
          const gasLimit = route.estimatedGasUsed?.toNumber() || 500000; // Universal Router typically needs more gas
          const gasPriceWei = await ethereum.provider.getGasPrice();
          const gasPrice = parseFloat(ethers.utils.formatUnits(gasPriceWei, 'gwei'));
          const gasCost = gasPrice * gasLimit * 1e-9; // Convert to ETH

          // Prepare balance changes
          const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
          const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

          // Store route in app state for later use in execute-swap
          // This gets cached for a brief period to be used by execute-swap
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
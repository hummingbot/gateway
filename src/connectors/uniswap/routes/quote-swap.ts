import { FastifyPluginAsync, FastifyInstance } from 'fastify';
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
import { AlphaRouter, SwapType, SwapOptionsSwapRouter02 } from '@uniswap/smart-order-router';
import { ethers } from 'ethers';

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
  recipient: string = ethers.constants.AddressZero // Default to zero address for quote
) {
  // Get Uniswap and Ethereum instances
  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);
  
  // Resolve tokens using Ethereum class
  const baseTokenInfo = ethereum.getTokenBySymbol(baseTokenSymbol);
  const quoteTokenInfo = ethereum.getTokenBySymbol(quoteTokenSymbol);
  
  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenInfo ? baseTokenSymbol : quoteTokenSymbol}`);
  }
  
  // Convert to Uniswap SDK Token objects
  const baseToken = new Token(
    ethereum.chainId,
    baseTokenInfo.address,
    baseTokenInfo.decimals,
    baseTokenInfo.symbol,
    baseTokenInfo.name
  );
  
  const quoteToken = new Token(
    ethereum.chainId,
    quoteTokenInfo.address,
    quoteTokenInfo.decimals,
    quoteTokenInfo.symbol,
    quoteTokenInfo.name
  );

  // Determine which token is being traded
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn 
    ? [baseToken, quoteToken] 
    : [quoteToken, baseToken];

  // Convert amount to token units with decimals
  const rawAmount = Math.floor(amount * Math.pow(10, inputToken.decimals)).toString();
  const inputAmount = CurrencyAmount.fromRawAmount(inputToken, rawAmount);

  // Calculate slippage tolerance
  const slippageTolerance = slippagePct 
    ? new Percent(Math.floor(slippagePct * 100), 10000)  // Convert to basis points
    : new Percent(50, 10000); // 0.5% default slippage

  // Initialize AlphaRouter for optimal routing
  const alphaRouter = new AlphaRouter({
    chainId: ethereum.chainId,
    provider: ethereum.provider as ethers.providers.JsonRpcProvider,
  });

  // Create specific swap options for SwapRouter02 only - no universal router
  const swapRouter02Options = {
    type: SwapType.SWAP_ROUTER_02,
    recipient, // Add recipient from parameter
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 1800 // 30 minutes
  } as SwapOptionsSwapRouter02;
  
  // Generate the route using SwapRouter02
  const route = await alphaRouter.route(
    inputAmount,
    outputToken,
    exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    undefined,
    {
      maxSwapsPerPath: uniswap.config.maximumHops || 4
    }
  );

  if (!route) {
    throw fastify.httpErrors.badRequest(`Could not find a route for ${baseTokenSymbol}-${quoteTokenSymbol}`);
  }
  
  // Log route details
  logger.info(`Route generation successful - has method parameters: ${!!route.methodParameters}`);
  
  // Log extra information about the route for debugging
  if (route.route) {
    const routeInfo = route.route.map(r => 
      `${r.tokenPath.map(t => t.symbol).join(' → ')}`
    ).join(', ');
    logger.info(`Route details: ${routeInfo}`);
  }

  // Calculate amounts
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

  // Calculate min/max values with slippage
  const minAmountOut = exactIn ? estimatedAmountOut * (1 - (slippagePct || 0.5) / 100) : estimatedAmountOut;
  const maxAmountIn = exactIn ? estimatedAmountIn : estimatedAmountIn * (1 + (slippagePct || 0.5) / 100);

  // Calculate price
  const price = estimatedAmountOut / estimatedAmountIn;
  
  // Calculate balance changes
  const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn;
  const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut;

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
    gasCost
  };
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
        
        try {
          // Use our shared quote function
          const quoteResult = await getUniswapQuote(
            fastify,
            networkToUse,
            baseTokenSymbol,
            quoteTokenSymbol,
            amount,
            side as 'BUY' | 'SELL',
            slippagePct
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
            gasCost: quoteResult.gasCost
          };
        } catch (error) {
          // If the error already has a status code, it's a Fastify HTTP error
          if (error.statusCode) {
            throw error;
          }
          
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
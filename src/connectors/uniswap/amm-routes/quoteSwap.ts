import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest
} from '../../../schemas/trading-types/swap-schema';
import {
  Token,
  CurrencyAmount,
  Percent,
  TradeType,
} from '@uniswap/sdk-core';
import {
  Pair as V2Pair,
  Route as V2Route,
  Trade as V2Trade
} from '@uniswap/v2-sdk';
import { formatTokenAmount } from '../uniswap.utils';
import { BigNumber } from 'ethers';

async function quoteAmmSwap(
  uniswap: Uniswap,
  poolAddress: string,
  baseToken: Token,
  quoteToken: Token,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number
): Promise<any> {
  try {
    // Log input parameters for debugging
    logger.info(`quoteAmmSwap: poolAddress=${poolAddress}, baseToken=${baseToken.symbol}, quoteToken=${quoteToken.symbol}, amount=${amount}, side=${side}`);
    
    // Get the V2 pair
    let pair;
    try {
      pair = await uniswap.getV2Pool(baseToken, quoteToken, poolAddress);
      if (!pair) {
        logger.error(`Pool not found at address ${poolAddress} for pair ${baseToken.symbol}-${quoteToken.symbol}`);
        throw new Error(`Pool not found for ${baseToken.symbol}-${quoteToken.symbol}`);
      }
    } catch (error) {
      logger.error(`Error getting V2 pool: ${error.message}`);
      // More specific error message for invalid pool address
      if (error.message.includes('invalid address') || error.message.includes('value out-of-bounds')) {
        throw new Error(`Invalid pool address: ${poolAddress}`);
      }
      throw error;
    }
    
    logger.info(`V2 pool found for ${baseToken.symbol}-${quoteToken.symbol}`);

    // Determine which token is being traded (exact in/out)
    const exactIn = side === 'SELL';
    const [inputToken, outputToken] = exactIn 
      ? [baseToken, quoteToken] 
      : [quoteToken, baseToken];
    
    logger.info(`Input token: ${inputToken.symbol}, Output token: ${outputToken.symbol}, exactIn: ${exactIn}`);

    // For BUY (exactOut), we need to create an amount for the output token
    // For SELL (exactIn), we create an amount for the input token
    const tokenForAmount = exactIn ? inputToken : outputToken;
    const rawAmount = Math.floor(amount * Math.pow(10, tokenForAmount.decimals));
    logger.info(`Converting amount ${amount} to raw amount ${rawAmount} with ${tokenForAmount.decimals} decimals for ${exactIn ? 'input' : 'output'}`);
    
    const tokenAmount = CurrencyAmount.fromRawAmount(
      tokenForAmount,
      rawAmount.toString()
    );

    // Create a route for the trade
    const route = new V2Route([pair], inputToken, outputToken);
    logger.info(`Created V2Route with path: ${route.path.map(t => t.symbol).join(' -> ')}`);

    // Create the V2 trade
    const trade = new V2Trade(
      route,
      tokenAmount,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT
    );
    
    logger.info(`Created V2Trade with type: ${exactIn ? 'EXACT_INPUT' : 'EXACT_OUTPUT'}`);

    // Calculate slippage-adjusted amounts
    const slippageTolerance = slippagePct 
      ? new Percent(slippagePct, 100) 
      : uniswap.getAllowedSlippage();
    
    logger.info(`Using slippage tolerance: ${slippageTolerance.toFixed(2)}%`);

    const minAmountOut = exactIn
      ? trade.minimumAmountOut(slippageTolerance).quotient.toString()
      : tokenAmount.quotient.toString();

    const maxAmountIn = exactIn
      ? tokenAmount.quotient.toString()
      : trade.maximumAmountIn(slippageTolerance).quotient.toString();

    // Calculate amounts
    const estimatedAmountIn = exactIn
      ? formatTokenAmount(tokenAmount.quotient.toString(), inputToken.decimals)
      : formatTokenAmount(trade.inputAmount.quotient.toString(), inputToken.decimals);

    const estimatedAmountOut = exactIn
      ? formatTokenAmount(trade.outputAmount.quotient.toString(), outputToken.decimals)
      : formatTokenAmount(tokenAmount.quotient.toString(), outputToken.decimals);

    const minAmountOutValue = formatTokenAmount(minAmountOut, outputToken.decimals);
    const maxAmountInValue = formatTokenAmount(maxAmountIn, inputToken.decimals);

    // Calculate price impact
    const priceImpact = parseFloat(trade.priceImpact.toSignificant(4));
    
    logger.info(`Quote results: estimatedAmountIn=${estimatedAmountIn}, estimatedAmountOut=${estimatedAmountOut}, minAmountOut=${minAmountOutValue}, maxAmountIn=${maxAmountInValue}, priceImpact=${priceImpact}%`);

    return {
      poolAddress,
      estimatedAmountIn,
      estimatedAmountOut,
      minAmountOut: minAmountOutValue,
      maxAmountIn: maxAmountInValue,
      priceImpact,
      inputToken,
      outputToken,
      trade,
    };
  } catch (error) {
    logger.error(`Error quoting AMM swap: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}

async function formatSwapQuote(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  logger.info(`formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, network=${network}`);
  
  try {
    // Get instances
    const uniswap = await Uniswap.getInstance(network);
    const ethereum = await Ethereum.getInstance(network);
    
    // Check if instances are ready
    if (!uniswap.ready()) {
      logger.info('Uniswap instance not ready, initializing...');
      await uniswap.init();
    }
    
    if (!ethereum.ready()) {
      logger.info('Ethereum instance not ready, initializing...');
      await ethereum.init();
    }

    // Resolve tokens
    const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
    const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

    if (!baseTokenObj) {
      logger.error(`Base token not found: ${baseToken}`);
      throw new Error(`Base token not found: ${baseToken}`);
    }
    
    if (!quoteTokenObj) {
      logger.error(`Quote token not found: ${quoteToken}`);
      throw new Error(`Quote token not found: ${quoteToken}`);
    }
    
    logger.info(`Base token: ${baseTokenObj.symbol}, address=${baseTokenObj.address}, decimals=${baseTokenObj.decimals}`);
    logger.info(`Quote token: ${quoteTokenObj.symbol}, address=${quoteTokenObj.address}, decimals=${quoteTokenObj.decimals}`);

    // Get the quote
    const quote = await quoteAmmSwap(
      uniswap,
      poolAddress,
      baseTokenObj,
      quoteTokenObj,
      amount,
      side,
      slippagePct
    );
    
    if (!quote) {
      throw new Error('Failed to get swap quote');
    }
    
    logger.info(`Quote result: estimatedAmountIn=${quote.estimatedAmountIn}, estimatedAmountOut=${quote.estimatedAmountOut}`);

    // Calculate balance changes based on which tokens are being swapped
    const baseTokenBalanceChange = side === 'BUY' ? quote.estimatedAmountOut : -quote.estimatedAmountIn;
    const quoteTokenBalanceChange = side === 'BUY' ? -quote.estimatedAmountIn : quote.estimatedAmountOut;
    
    logger.info(`Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`);

    // Get gas estimate
    // For V2 trades, we use the path from the route directly
    const pathLength = quote.trade.route.path.length;
    const estimatedGasValue = pathLength * 150000; // Approximate gas per swap
    logger.info(`Estimating gas for path length ${pathLength}: ${estimatedGasValue}`);
    
    // Get gas price
    const gasPrice = await ethereum.provider.getGasPrice();
    logger.info(`Gas price from provider: ${gasPrice.toString()}`);
    
    // Convert estimatedGas to BigNumber for multiplication
    const estimatedGasBN = BigNumber.from(estimatedGasValue.toString());
    
    // Calculate gas cost
    const gasCostRaw = gasPrice.mul(estimatedGasBN);
    const gasCost = formatTokenAmount(gasCostRaw.toString(), 18); // ETH has 18 decimals
    logger.info(`Gas cost: ${gasCost} ETH`);

    // Calculate price - this should always be quote/base regardless of direction
    let price;
    if (side === 'SELL') {
      // For SELL, estimatedAmountIn is baseToken and estimatedAmountOut is quoteToken
      price = quote.estimatedAmountOut / quote.estimatedAmountIn;
    } else {
      // For BUY, estimatedAmountIn is quoteToken and estimatedAmountOut is baseToken
      price = quote.estimatedAmountIn / quote.estimatedAmountOut;
    }
    
    logger.info(`Calculated price for ${side} direction: ${price}`);
    
    // Format gas price as Gwei
    const gasPriceGwei = formatTokenAmount(gasPrice.toString(), 9); // Convert to Gwei
    logger.info(`Gas price in Gwei: ${gasPriceGwei}`);

    return {
      poolAddress,
      estimatedAmountIn: quote.estimatedAmountIn,
      estimatedAmountOut: quote.estimatedAmountOut,
      minAmountOut: quote.minAmountOut,
      maxAmountIn: quote.maxAmountIn,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      price,
      gasPrice: Number(gasPriceGwei), // Convert to number
      gasLimit: estimatedGasValue, // Already a number
      gasCost
    };
  } catch (error) {
    logger.error(`Error formatting swap quote: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Uniswap V2 AMM',
        tags: ['uniswap/amm'],
        querystring:{ 
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'base' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: {
            properties: {
              ...GetSwapQuoteResponse.properties,
            }
          }
        },
      }
    },
    async (request) => {
      try {
        const { network, poolAddress: requestedPoolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;
        const networkToUse = network || 'base';

        const uniswap = await Uniswap.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;
        
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');
          
          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }

        return await formatSwapQuote(
          fastify,
          networkToUse,
          poolAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct
        );
      } catch (e) {
        logger.error(`Error in quote-swap route: ${e.message}`);
        if (e.stack) {
          logger.debug(`Stack trace: ${e.stack}`);
        }
        
        // Return appropriate error based on the error message
        if (e.statusCode) {
          throw e; // Already a formatted Fastify error
        } else if (e.message.includes('Invalid pool address')) {
          throw fastify.httpErrors.badRequest(`Invalid pool address provided`);
        } else if (e.message.includes('Pool not found')) {
          throw fastify.httpErrors.notFound(`Pool not found for the requested token pair`);
        } else if (e.message.includes('token not found')) {
          throw fastify.httpErrors.badRequest(e.message);
        } else {
          throw fastify.httpErrors.internalServerError(`Error getting swap quote: ${e.message}`);
        }
      }
    }
  );
};

export default quoteSwapRoute;
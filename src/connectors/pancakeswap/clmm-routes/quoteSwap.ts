import { Token, CurrencyAmount, Percent, TradeType } from '@pancakeswap/sdk';
import { Route as V3Route, Trade as V3Trade } from '@pancakeswap/v3-sdk';
import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  QuoteSwapRequestType,
  QuoteSwapResponseType,
  QuoteSwapRequest,
  QuoteSwapResponse,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import { formatTokenAmount, getPancakeswapPoolInfo } from '../pancakeswap.utils';

async function quoteClmmSwap(
  pancakeswap: Pancakeswap,
  poolAddress: string,
  baseToken: Token,
  quoteToken: Token,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<any> {
  try {
    // Get the V3 pool - only use poolAddress
    const pool = await pancakeswap.getV3Pool(
      baseToken,
      quoteToken,
      undefined, // No fee amount needed, using poolAddress directly
      poolAddress,
    );
    if (!pool) {
      throw new Error(`Pool not found for ${baseToken.symbol}-${quoteToken.symbol}`);
    }

    // Determine which token is being traded (exact in/out)
    const exactIn = side === 'SELL';
    const [inputToken, outputToken] = exactIn ? [baseToken, quoteToken] : [quoteToken, baseToken];

    // Create a route for the trade
    const route = new V3Route([pool], inputToken, outputToken);

    // Create the V3 trade
    let trade;
    if (exactIn) {
      // For SELL (exactIn), we use the input amount and EXACT_INPUT trade type
      // Use parseUnits to avoid scientific notation issues with large numbers
      const inputAmount = CurrencyAmount.fromRawAmount(
        inputToken,
        utils.parseUnits(amount.toString(), inputToken.decimals).toString(),
      );
      trade = await V3Trade.fromRoute(route, inputAmount, TradeType.EXACT_INPUT);
    } else {
      // For BUY (exactOut), we use the output amount and EXACT_OUTPUT trade type
      // Use parseUnits to avoid scientific notation issues with large numbers
      const outputAmount = CurrencyAmount.fromRawAmount(
        outputToken,
        utils.parseUnits(amount.toString(), outputToken.decimals).toString(),
      );
      trade = await V3Trade.fromRoute(route, outputAmount, TradeType.EXACT_OUTPUT);
    }

    // Calculate slippage-adjusted amounts
    // Convert slippagePct to integer basis points (0.5% -> 50 basis points)
    const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

    const minAmountOut = exactIn
      ? trade.minimumAmountOut(slippageTolerance).quotient.toString()
      : trade.outputAmount.quotient.toString();

    const maxAmountIn = exactIn
      ? trade.inputAmount.quotient.toString()
      : trade.maximumAmountIn(slippageTolerance).quotient.toString();

    // Calculate amounts - trade object has inputAmount and outputAmount for both types
    const estimatedAmountIn = formatTokenAmount(trade.inputAmount.quotient.toString(), inputToken.decimals);

    const estimatedAmountOut = formatTokenAmount(trade.outputAmount.quotient.toString(), outputToken.decimals);

    const minAmountOutValue = formatTokenAmount(minAmountOut, outputToken.decimals);
    const maxAmountInValue = formatTokenAmount(maxAmountIn, inputToken.decimals);

    // Calculate price impact
    const priceImpact = parseFloat(trade.priceImpact.toSignificant(4));

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
      // Add raw values for execution
      rawAmountIn: trade.inputAmount.quotient.toString(),
      rawAmountOut: trade.outputAmount.quotient.toString(),
      rawMinAmountOut: minAmountOut,
      rawMaxAmountIn: maxAmountIn,
      feeTier: pool.fee,
    };
  } catch (error) {
    logger.error(`Error quoting CLMM swap: ${error.message}`);
    throw error;
  }
}

export async function getPancakeswapClmmQuote(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<{
  quote: any;
  pancakeswap: any;
  ethereum: any;
  baseTokenObj: any;
  quoteTokenObj: any;
}> {
  // Get instances
  const pancakeswap = await Pancakeswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  if (!ethereum.ready()) {
    logger.info('Ethereum instance not ready, initializing...');
    await ethereum.init();
  }

  // Resolve tokens
  const baseTokenObj = await pancakeswap.getToken(baseToken);
  const quoteTokenObj = await pancakeswap.getToken(quoteToken);

  if (!baseTokenObj) {
    logger.error(`Base token not found: ${baseToken}`);
    throw new Error(sanitizeErrorMessage('Base token not found: {}', baseToken));
  }

  if (!quoteTokenObj) {
    logger.error(`Quote token not found: ${quoteToken}`);
    throw new Error(sanitizeErrorMessage('Quote token not found: {}', quoteToken));
  }

  logger.info(`Base token: ${baseTokenObj.symbol}, address=${baseTokenObj.address}, decimals=${baseTokenObj.decimals}`);
  logger.info(
    `Quote token: ${quoteTokenObj.symbol}, address=${quoteTokenObj.address}, decimals=${quoteTokenObj.decimals}`,
  );

  // Get the quote
  const quote = await quoteClmmSwap(
    pancakeswap,
    poolAddress,
    baseTokenObj,
    quoteTokenObj,
    amount,
    side as 'BUY' | 'SELL',
    slippagePct,
  );

  if (!quote) {
    throw new Error('Failed to get swap quote');
  }

  return {
    quote,
    pancakeswap,
    ethereum,
    baseTokenObj,
    quoteTokenObj,
  };
}

async function formatSwapQuote(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  logger.info(
    `formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, network=${network}`,
  );

  try {
    // Use the extracted quote function
    const { quote, ethereum } = await getPancakeswapClmmQuote(
      network,
      poolAddress,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
    );

    logger.info(
      `Quote result: estimatedAmountIn=${quote.estimatedAmountIn}, estimatedAmountOut=${quote.estimatedAmountOut}`,
    );

    // Calculate balance changes based on which tokens are being swapped
    const baseTokenBalanceChange = side === 'BUY' ? quote.estimatedAmountOut : -quote.estimatedAmountIn;
    const quoteTokenBalanceChange = side === 'BUY' ? -quote.estimatedAmountIn : quote.estimatedAmountOut;

    logger.info(
      `Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`,
    );

    // Get gas estimate for V3 swap
    const estimatedGasValue = 200000; // V3 swaps use more gas than V2
    const gasPrice = await ethereum.provider.getGasPrice();
    logger.info(`Gas price from provider: ${gasPrice.toString()}`);

    // Calculate gas cost
    const estimatedGasBN = BigNumber.from(estimatedGasValue.toString());
    const gasCostRaw = gasPrice.mul(estimatedGasBN);
    const gasCost = formatTokenAmount(gasCostRaw.toString(), 18); // ETH has 18 decimals
    logger.info(`Gas cost: ${gasCost} ETH`);

    // Calculate price based on side
    // For SELL: price = quote received / base sold
    // For BUY: price = quote needed / base received
    const price =
      side === 'SELL'
        ? quote.estimatedAmountOut / quote.estimatedAmountIn
        : quote.estimatedAmountIn / quote.estimatedAmountOut;

    // Format gas price as Gwei
    const gasPriceGwei = formatTokenAmount(gasPrice.toString(), 9); // Convert to Gwei
    logger.info(`Gas price in Gwei: ${gasPriceGwei}`);

    // Calculate price impact percentage
    const priceImpactPct = quote.priceImpact;

    // Get current tick from pool

    // Determine token addresses for computed fields
    const tokenIn = quote.inputToken.address;
    const tokenOut = quote.outputToken.address;

    // Calculate fee (V3 has dynamic fees based on pool)

    return {
      // Base QuoteSwapResponse fields in correct order
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn: quote.estimatedAmountIn,
      amountOut: quote.estimatedAmountOut,
      price,
      slippagePct,
      minAmountOut: quote.minAmountOut,
      maxAmountIn: quote.maxAmountIn,
      // CLMM-specific fields
      priceImpactPct,
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
  // Import the httpErrors plugin to ensure it's available
  await fastify.register(require('@fastify/sensible'));

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Pancakeswap V3 CLMM',
        tags: ['/connector/pancakeswap'],
        querystring: {
          ...QuoteSwapRequest,
          properties: {
            ...QuoteSwapRequest.properties,
            network: { type: 'string', default: 'bsc', examples: ['bsc'] },
            baseToken: { type: 'string', examples: ['USDT'] },
            quoteToken: { type: 'string', examples: ['WBNB'] },
            amount: { type: 'number', examples: [10] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: QuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;

        const networkToUse = network;

        // Validate essential parameters
        if (!baseToken || !amount || !side) {
          throw httpErrors.badRequest('baseToken, amount, and side are required');
        }

        const pancakeswap = await Pancakeswap.getInstance(networkToUse);

        let poolAddressToUse = poolAddress;
        let baseTokenToUse: string;
        let quoteTokenToUse: string;

        if (poolAddressToUse) {
          // Pool address provided, get pool info to determine tokens
          const poolInfo = await getPancakeswapPoolInfo(poolAddressToUse, networkToUse, 'clmm');
          if (!poolInfo) {
            throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddressToUse));
          }

          // Determine which token is base and which is quote based on the provided baseToken
          if (baseToken === poolInfo.baseTokenAddress) {
            baseTokenToUse = poolInfo.baseTokenAddress;
            quoteTokenToUse = poolInfo.quoteTokenAddress;
          } else if (baseToken === poolInfo.quoteTokenAddress) {
            // User specified the quote token as base, so swap them
            baseTokenToUse = poolInfo.quoteTokenAddress;
            quoteTokenToUse = poolInfo.baseTokenAddress;
          } else {
            // Try to resolve baseToken as symbol to address
            const resolvedToken = await pancakeswap.getToken(baseToken);

            if (resolvedToken) {
              if (resolvedToken.address === poolInfo.baseTokenAddress) {
                baseTokenToUse = poolInfo.baseTokenAddress;
                quoteTokenToUse = poolInfo.quoteTokenAddress;
              } else if (resolvedToken.address === poolInfo.quoteTokenAddress) {
                baseTokenToUse = poolInfo.quoteTokenAddress;
                quoteTokenToUse = poolInfo.baseTokenAddress;
              } else {
                throw httpErrors.badRequest(`Token ${baseToken} not found in pool ${poolAddressToUse}`);
              }
            } else {
              throw httpErrors.badRequest(`Token ${baseToken} not found in pool ${poolAddressToUse}`);
            }
          }
        } else {
          // No pool address provided, need quoteToken to find pool
          if (!quoteToken) {
            throw httpErrors.badRequest('quoteToken is required when poolAddress is not provided');
          }

          baseTokenToUse = baseToken;
          quoteTokenToUse = quoteToken;

          // Find pool using findDefaultPool
          poolAddressToUse = await pancakeswap.findDefaultPool(baseTokenToUse, quoteTokenToUse, 'clmm');

          if (!poolAddressToUse) {
            throw httpErrors.notFound(`No CLMM pool found for pair ${baseTokenToUse}-${quoteTokenToUse}`);
          }
        }

        return await formatSwapQuote(
          networkToUse,
          poolAddressToUse,
          baseTokenToUse,
          quoteTokenToUse,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        logger.error('Unexpected error getting swap quote:', e);
        throw httpErrors.internalServerError('Error getting swap quote');
      }
    },
  );
};

export default quoteSwapRoute;

// Export quoteSwap wrapper for chain-level routes
export async function quoteSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  return await formatSwapQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);
}

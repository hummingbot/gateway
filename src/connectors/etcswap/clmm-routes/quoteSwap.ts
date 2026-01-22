// ETCswap SDK imports - Using unified ETCswap SDKs for type consistency
import { Token, CurrencyAmount, Percent, TradeType } from '@etcswapv2/sdk-core';
import { Pool as V3Pool, Route as V3Route, Trade as V3Trade } from '@etcswapv3/sdk';
import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

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
import { ETCswap } from '../etcswap';
import { ETCswapConfig } from '../etcswap.config';
import { isV3Available } from '../etcswap.contracts';
import { formatTokenAmount, getETCswapPoolInfo } from '../etcswap.utils';

async function quoteClmmSwap(
  etcswap: ETCswap,
  poolAddress: string,
  baseToken: Token,
  quoteToken: Token,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = ETCswapConfig.config.slippagePct,
): Promise<any> {
  try {
    // Get the V3 pool - only use poolAddress
    const pool = await etcswap.getV3Pool(
      baseToken,
      quoteToken,
      undefined, // No fee amount needed, using poolAddress directly
      poolAddress,
    );
    if (!pool) {
      throw httpErrors.notFound(`Pool not found for ${baseToken.symbol}-${quoteToken.symbol}`);
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
      const rawAmount = utils.parseUnits(amount.toString(), inputToken.decimals);
      const inputAmount = CurrencyAmount.fromRawAmount(inputToken, JSBI.BigInt(rawAmount.toString()));
      trade = await V3Trade.fromRoute(route, inputAmount, TradeType.EXACT_INPUT);
    } else {
      // For BUY (exactOut), we use the output amount and EXACT_OUTPUT trade type
      const rawAmount = utils.parseUnits(amount.toString(), outputToken.decimals);
      const outputAmount = CurrencyAmount.fromRawAmount(outputToken, JSBI.BigInt(rawAmount.toString()));
      trade = await V3Trade.fromRoute(route, outputAmount, TradeType.EXACT_OUTPUT);
    }

    // Calculate slippage-adjusted amounts
    const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

    const minAmountOut = exactIn
      ? trade.minimumAmountOut(slippageTolerance).quotient.toString()
      : trade.outputAmount.quotient.toString();

    const maxAmountIn = exactIn
      ? trade.inputAmount.quotient.toString()
      : trade.maximumAmountIn(slippageTolerance).quotient.toString();

    // Calculate amounts
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

export async function getETCswapClmmQuote(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = ETCswapConfig.config.slippagePct,
): Promise<{
  quote: any;
  etcswap: any;
  ethereum: any;
  baseTokenObj: any;
  quoteTokenObj: any;
}> {
  // Check if V3 is available on this network
  if (!isV3Available(network)) {
    throw httpErrors.badRequest(`ETCswap V3 (CLMM) is not available on network: ${network}`);
  }

  // Get instances
  const etcswap = await ETCswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  if (!ethereum.ready()) {
    logger.info('Ethereum instance not ready, initializing...');
    await ethereum.init();
  }

  // Resolve tokens from local token list
  const baseTokenObj = await etcswap.getToken(baseToken);
  const quoteTokenObj = await etcswap.getToken(quoteToken);

  if (!baseTokenObj) {
    logger.error(`Base token not found: ${baseToken}`);
    throw httpErrors.notFound(sanitizeErrorMessage('Base token not found: {}', baseToken));
  }

  if (!quoteTokenObj) {
    logger.error(`Quote token not found: ${quoteToken}`);
    throw httpErrors.notFound(sanitizeErrorMessage('Quote token not found: {}', quoteToken));
  }

  logger.info(`Base token: ${baseTokenObj.symbol}, address=${baseTokenObj.address}, decimals=${baseTokenObj.decimals}`);
  logger.info(
    `Quote token: ${quoteTokenObj.symbol}, address=${quoteTokenObj.address}, decimals=${quoteTokenObj.decimals}`,
  );

  // Get the quote
  const quote = await quoteClmmSwap(
    etcswap,
    poolAddress,
    baseTokenObj,
    quoteTokenObj,
    amount,
    side as 'BUY' | 'SELL',
    slippagePct,
  );

  if (!quote) {
    throw httpErrors.internalServerError('Failed to get swap quote');
  }

  return {
    quote,
    etcswap,
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
  slippagePct: number = ETCswapConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  logger.info(
    `formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, network=${network}`,
  );

  try {
    const { quote, ethereum } = await getETCswapClmmQuote(
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

    // Get gas estimate
    const estimatedGasValue = 200000; // Approximate gas for V3 swap
    const gasPrice = await ethereum.provider.getGasPrice();
    logger.info(`Gas price from provider: ${gasPrice.toString()}`);

    // Calculate price based on side
    const price =
      side === 'SELL'
        ? quote.estimatedAmountOut / quote.estimatedAmountIn
        : quote.estimatedAmountIn / quote.estimatedAmountOut;

    // Calculate price impact percentage
    const priceImpactPct = quote.priceImpact;

    // Determine token addresses
    const tokenIn = quote.inputToken.address;
    const tokenOut = quote.outputToken.address;

    // Calculate fee based on fee tier
    const feePct = quote.feeTier / 1000000; // Convert from basis points
    const fee = quote.estimatedAmountIn * feePct;

    return {
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn: quote.estimatedAmountIn,
      amountOut: quote.estimatedAmountOut,
      price,
      slippagePct,
      minAmountOut: quote.minAmountOut,
      maxAmountIn: quote.maxAmountIn,
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
  await fastify.register(require('@fastify/sensible'));

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: QuoteSwapResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for ETCswap V3 CLMM',
        tags: ['/connector/etcswap'],
        querystring: {
          ...QuoteSwapRequest,
          properties: {
            ...QuoteSwapRequest.properties,
            network: { type: 'string', default: 'classic' },
            baseToken: { type: 'string', examples: ['WETC'] },
            quoteToken: { type: 'string', examples: ['USC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [2] },
          },
        },
        response: { 200: QuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network = 'classic', poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;

        // Validate essential parameters
        if (!baseToken || !amount || !side) {
          throw httpErrors.badRequest('baseToken, amount, and side are required');
        }

        const etcswap = await ETCswap.getInstance(network);

        let poolAddressToUse = poolAddress;
        let baseTokenToUse: string;
        let quoteTokenToUse: string;

        if (poolAddressToUse) {
          // Pool address provided, get pool info to determine tokens
          const poolInfo = await getETCswapPoolInfo(poolAddressToUse, network, 'clmm');
          if (!poolInfo) {
            throw httpErrors.notFound(`Pool not found: ${poolAddressToUse}`);
          }

          // Determine which token is base and which is quote
          if (baseToken === poolInfo.baseTokenAddress) {
            baseTokenToUse = poolInfo.baseTokenAddress;
            quoteTokenToUse = poolInfo.quoteTokenAddress;
          } else if (baseToken === poolInfo.quoteTokenAddress) {
            baseTokenToUse = poolInfo.quoteTokenAddress;
            quoteTokenToUse = poolInfo.baseTokenAddress;
          } else {
            const resolvedToken = await etcswap.getToken(baseToken);
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
          poolAddressToUse = await etcswap.findDefaultPool(baseTokenToUse, quoteTokenToUse, 'clmm');

          if (!poolAddressToUse) {
            throw httpErrors.notFound(`No CLMM pool found for pair ${baseTokenToUse}-${quoteTokenToUse}`);
          }
        }

        return await formatSwapQuote(
          network,
          poolAddressToUse,
          baseTokenToUse,
          quoteTokenToUse,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        logger.error(`Error in quote-swap route: ${e.message}`);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError(e.message || 'Error getting swap quote');
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
  slippagePct: number = ETCswapConfig.config.slippagePct,
): Promise<QuoteSwapResponseType> {
  return await formatSwapQuote(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);
}

import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import {
  Pool as V3Pool,
  SwapQuoter,
  SwapOptions,
  Route as V3Route,
  Trade as V3Trade,
} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest,
} from '../../../schemas/trading-types/swap-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { formatTokenAmount, parseFeeTier } from '../uniswap.utils';

async function quoteClmmSwap(
  uniswap: Uniswap,
  poolAddress: string,
  baseToken: Token,
  quoteToken: Token,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
): Promise<any> {
  try {
    // Get the V3 pool - only use poolAddress
    const pool = await uniswap.getV3Pool(
      baseToken,
      quoteToken,
      undefined, // No fee amount needed, using poolAddress directly
      poolAddress,
    );
    if (!pool) {
      throw new Error(
        `Pool not found for ${baseToken.symbol}-${quoteToken.symbol}`,
      );
    }

    // Determine which token is being traded (exact in/out)
    const exactIn = side === 'SELL';
    const [inputToken, outputToken] = exactIn
      ? [baseToken, quoteToken]
      : [quoteToken, baseToken];

    // Convert amount to token units with decimals
    const inputAmount = CurrencyAmount.fromRawAmount(
      inputToken,
      JSBI.BigInt(
        Math.floor(amount * Math.pow(10, inputToken.decimals)).toString(),
      ),
    );

    // Create a route for the trade
    const route = new V3Route([pool], inputToken, outputToken);

    // Create the V3 trade
    const trade = await V3Trade.fromRoute(
      route,
      inputAmount,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    );

    // Calculate slippage-adjusted amounts
    const slippageTolerance = slippagePct
      ? new Percent(slippagePct, 100)
      : uniswap.getAllowedSlippage();

    const minAmountOut = exactIn
      ? trade.minimumAmountOut(slippageTolerance).quotient.toString()
      : inputAmount.quotient.toString();

    const maxAmountIn = exactIn
      ? inputAmount.quotient.toString()
      : trade.maximumAmountIn(slippageTolerance).quotient.toString();

    // Calculate amounts
    const estimatedAmountIn = exactIn
      ? formatTokenAmount(inputAmount.quotient.toString(), inputToken.decimals)
      : formatTokenAmount(
          trade.inputAmount.quotient.toString(),
          inputToken.decimals,
        );

    const estimatedAmountOut = exactIn
      ? formatTokenAmount(
          trade.outputAmount.quotient.toString(),
          outputToken.decimals,
        )
      : formatTokenAmount(
          inputAmount.quotient.toString(),
          outputToken.decimals,
        );

    const minAmountOutValue = formatTokenAmount(
      minAmountOut,
      outputToken.decimals,
    );
    const maxAmountInValue = formatTokenAmount(
      maxAmountIn,
      inputToken.decimals,
    );

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
    };
  } catch (error) {
    logger.error(`Error quoting CLMM swap: ${error.message}`);
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
  slippagePct?: number,
): Promise<GetSwapQuoteResponseType> {
  logger.info(
    `formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, network=${network}`,
  );

  try {
    // Get instances
    const uniswap = await Uniswap.getInstance(network);
    const ethereum = await Ethereum.getInstance(network);

    // Instances are always ready with new getInstance pattern
    // No need to check ready() or call init()

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

    logger.info(
      `Base token: ${baseTokenObj.symbol}, address=${baseTokenObj.address}, decimals=${baseTokenObj.decimals}`,
    );
    logger.info(
      `Quote token: ${quoteTokenObj.symbol}, address=${quoteTokenObj.address}, decimals=${quoteTokenObj.decimals}`,
    );

    // Get the quote
    const quote = await quoteClmmSwap(
      uniswap,
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

    logger.info(
      `Quote result: estimatedAmountIn=${quote.estimatedAmountIn}, estimatedAmountOut=${quote.estimatedAmountOut}`,
    );

    // Calculate balance changes based on which tokens are being swapped
    const baseTokenBalanceChange =
      side === 'BUY' ? quote.estimatedAmountOut : -quote.estimatedAmountIn;
    const quoteTokenBalanceChange =
      side === 'BUY' ? -quote.estimatedAmountIn : quote.estimatedAmountOut;

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

    // Calculate price
    const price = quote.estimatedAmountOut / quote.estimatedAmountIn;

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
      gasCost,
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
        description: 'Get swap quote for Uniswap V3 CLMM',
        tags: ['uniswap/clmm'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'base' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [0.5] },
          },
        },
        response: {
          200: {
            properties: {
              ...GetSwapQuoteResponse.properties,
            },
          },
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
        } = request.query;

        const networkToUse = network || 'base';

        const uniswap = await Uniswap.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;

        if (!poolAddress) {
          // Look up the pool from configuration pools dictionary
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

        return await formatSwapQuote(
          fastify,
          networkToUse,
          poolAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError(
          `Error getting swap quote: ${e.message}`,
        );
      }
    },
  );
};

export default quoteSwapRoute;

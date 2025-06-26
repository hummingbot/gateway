import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Cardano, CardanoTokenInfo } from '../../../chains/cardano/cardano';
import {
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Minswap } from '../minswap'; // Added DexV2Calculation import
import { formatTokenAmount } from '../minswap.utils';
import {
  Asset,
  calculateSwapExactIn,
  calculateSwapExactOut,
} from '@aiquant/minswap-sdk';

async function quoteAmmSwap(
  minswap: Minswap,
  poolAddress: string,
  baseToken: CardanoTokenInfo,
  quoteToken: CardanoTokenInfo,
  amount: number,
  side: 'BUY' | 'SELL',
): Promise<any> {
  try {
    // Get the V2 pair
    const assetA: Asset = {
      policyId: baseToken.policyId,
      tokenName: baseToken.assetName,
    };

    const assetB: Asset = {
      policyId: quoteToken.policyId,
      tokenName: quoteToken.assetName,
    };

    const pool = await minswap.blockfrostAdapter.getV2PoolByPair(
      assetA,
      assetB,
    );

    if (!pool) {
      throw new Error(
        `Pool not found for ${baseToken.symbol}-${quoteToken.symbol}`,
      );
    }

    // Form full asset IDs for comparison
    // if base token is ADA then take baseTokenAsset as lovelace
    let baseTokenAsset: string;
    if (baseToken.symbol === 'ADA') {
      baseTokenAsset = 'lovelace';
    } else {
      baseTokenAsset = baseToken.policyId + baseToken.assetName;
    }
    const quoteTokenAsset = quoteToken.policyId + quoteToken.assetName;

    // Determine which token is being traded
    const exactIn = side === 'SELL';
    const inputToken = exactIn ? baseToken : quoteToken;
    const outputToken = exactIn ? quoteToken : baseToken;

    // Convert amount to baseToken's smallest unit (since amount always refers to baseToken)
    const amountInSmallestUnit = BigNumber.from(
      Math.floor(amount * Math.pow(10, baseToken.decimals)),
    ).toBigInt();

    // Determine reserves and fee based on trading direction
    let reserveIn: bigint;
    let reserveOut: bigint;
    let tradingFeeNumerator: bigint;

    if (exactIn) {
      // Selling baseToken (inputToken = baseToken)
      console.log(pool);

      console.log(
        'pool.assetA' + pool.assetA,
        'baseTokenAsset' + baseTokenAsset,
      );

      if (baseTokenAsset === pool.assetA) {
        reserveIn = pool.reserveA;
        reserveOut = pool.reserveB;
        tradingFeeNumerator = pool.feeA[0]; // Fee for A->B
      } else if (baseTokenAsset === pool.assetB) {
        reserveIn = pool.reserveB;
        reserveOut = pool.reserveA;
        tradingFeeNumerator = pool.feeA[1]; // Fee for B->A
      } else {
        throw new Error('Base token not found in pool');
      }
    } else {
      // Buying baseToken (inputToken = quoteToken)
      if (quoteTokenAsset === pool.assetA) {
        reserveIn = pool.reserveA;
        reserveOut = pool.reserveB;
        tradingFeeNumerator = pool.feeA[0]; // Fee for A->B
      } else if (quoteTokenAsset === pool.assetB) {
        reserveIn = pool.reserveB;
        reserveOut = pool.reserveA;
        tradingFeeNumerator = pool.feeA[1]; // Fee for B->A
      } else {
        throw new Error('Quote token not found in pool');
      }
    }

    // Perform calculations
    let inputAmount: bigint;
    let outputAmount: bigint;
    let priceImpact: number;

    if (exactIn) {
      inputAmount = amountInSmallestUnit;
      const result = calculateSwapExactIn({
        amountIn: inputAmount,
        reserveIn,
        reserveOut,
      });
      outputAmount = result.amountOut;
      priceImpact = result.priceImpact.toNumber();
    } else {
      outputAmount = amountInSmallestUnit;
      const result = calculateSwapExactOut({
        exactAmountOut: outputAmount,
        reserveIn,
        reserveOut,
      });
      inputAmount = result.amountIn;
      priceImpact = result.priceImpact.toNumber();
    }

    // Calculate slippage amounts (using 0.5% default slippage)
    const slippagePercent = 0.5;
    const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 100));
    const slippageDenominator = 10000n;

    const minAmountOut = exactIn
      ? (outputAmount * slippageFactor) / slippageDenominator
      : outputAmount;

    const maxAmountIn = exactIn
      ? inputAmount
      : (inputAmount * BigInt(10000 + Math.floor(slippagePercent * 100))) /
        slippageDenominator;

    // Format amounts for display
    const estimatedAmountIn = formatTokenAmount(
      inputAmount.toString(),
      inputToken.decimals,
    );

    const estimatedAmountOut = formatTokenAmount(
      outputAmount.toString(),
      outputToken.decimals,
    );

    const minAmountOutValue = formatTokenAmount(
      minAmountOut.toString(),
      outputToken.decimals,
    );

    const maxAmountInValue = formatTokenAmount(
      maxAmountIn.toString(),
      inputToken.decimals,
    );

    return {
      poolAddress,
      estimatedAmountIn,
      estimatedAmountOut,
      minAmountOut: minAmountOutValue,
      maxAmountIn: maxAmountInValue,
      priceImpact,
      inputToken,
      outputToken,
      // Add raw values for execution
      rawAmountIn: inputAmount.toString(),
      rawAmountOut: outputAmount.toString(),
      rawMinAmountOut: minAmountOut.toString(),
      rawMaxAmountIn: maxAmountIn.toString(),
      pathAddresses: [
        inputToken.address || `${inputToken.policyId}.${inputToken.assetName}`,
        outputToken.address ||
          `${outputToken.policyId}.${outputToken.assetName}`,
      ],
    };
  } catch (error) {
    logger.error(`Error quoting AMM swap: ${error.message}`);
    // Check for insufficient reserves error
    if (
      error.message?.includes('INSUFFICIENT_RESERVES') ||
      error.message?.includes('insufficient') ||
      error.name === 'InsufficientReservesError'
    ) {
      throw new Error(
        `Insufficient liquidity in pool for ${baseToken.symbol}-${quoteToken.symbol}`,
      );
    }
    throw error;
  }
}

export async function getMinswapAmmQuote(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
): Promise<{
  quote: any;
  minswap: any;
  cardano: any;
  baseTokenObj: any;
  quoteTokenObj: any;
}> {
  // Get instances
  const minswap = await Minswap.getInstance(network);
  const cardano = await Cardano.getInstance(network);

  if (!cardano.ready()) {
    logger.info('Cardano instance not ready, initializing...');
    await cardano.init();
  }

  // Resolve tokens
  const baseTokenObj = cardano.getTokenBySymbol(baseToken);
  const quoteTokenObj = cardano.getTokenBySymbol(quoteToken);

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
  const quote = await quoteAmmSwap(
    minswap,
    poolAddress,
    baseTokenObj,
    quoteTokenObj,
    amount,
    side as 'BUY' | 'SELL',
  );

  if (!quote) {
    throw new Error('Failed to get swap quote');
  }

  return {
    quote,
    minswap,
    cardano,
    baseTokenObj,
    quoteTokenObj,
  };
}

async function formatSwapQuote(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
): Promise<GetSwapQuoteResponseType> {
  logger.info(
    `formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, network=${network}`,
  );

  try {
    // Use the extracted quote function
    const { quote, minswap, cardano, baseTokenObj, quoteTokenObj } =
      await getMinswapAmmQuote(
        fastify,
        network,
        poolAddress,
        baseToken,
        quoteToken,
        amount,
        side,
      );

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

    // Calculate price based on side
    // For SELL: price = quote received / base sold
    // For BUY: price = quote needed / base received
    const price =
      side === 'SELL'
        ? quote.estimatedAmountOut / quote.estimatedAmountIn
        : quote.estimatedAmountIn / quote.estimatedAmountOut;

    return {
      poolAddress,
      estimatedAmountIn: quote.estimatedAmountIn,
      estimatedAmountOut: quote.estimatedAmountOut,
      minAmountOut: quote.minAmountOut,
      maxAmountIn: quote.maxAmountIn,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      price,
      gasPrice: 0,
      gasLimit: 0,
      gasCost: 0,
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
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get swap quote for Minswap AMM',
        tags: ['minswap/amm'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['ADA'] },
            quoteToken: { type: 'string', examples: ['MIN'] },
            amount: { type: 'number', examples: [0.001] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] },
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

        const networkToUse = network || 'mainnet';

        console.log('working upto here');
        const minswap = await Minswap.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;

        if (!poolAddress) {
          // Look up the pool from configuration pools dictionary
          poolAddress = await minswap.findDefaultPool(
            baseToken,
            quoteToken,
            'amm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`,
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
        );
      } catch (e) {
        logger.error(`Error in quote-swap route: ${e.message}`);

        // If it's already a Fastify HTTP error, re-throw it
        if (e.statusCode) {
          throw e;
        }

        // Check for specific error types
        if (e.message?.includes('Insufficient liquidity')) {
          throw fastify.httpErrors.badRequest(e.message);
        }
        if (
          e.message?.includes('Pool not found') ||
          e.message?.includes('No AMM pool found')
        ) {
          throw fastify.httpErrors.notFound(e.message);
        }
        if (e.message?.includes('token not found')) {
          throw fastify.httpErrors.badRequest(e.message);
        }

        // Default to internal server error with the actual error message
        throw fastify.httpErrors.internalServerError(
          `Error getting swap quote: ${e.message || 'Unknown error'}`,
        );
      }
    },
  );
};

export default quoteSwapRoute;

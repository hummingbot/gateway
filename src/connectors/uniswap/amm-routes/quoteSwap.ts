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
    // Get the V2 pair
    const pair = await uniswap.getV2Pool(baseToken, quoteToken, poolAddress);
    if (!pair) {
      throw new Error(`Pool not found for ${baseToken.symbol}-${quoteToken.symbol}`);
    }

    // Determine which token is being traded (exact in/out)
    const exactIn = side === 'SELL';
    const [inputToken, outputToken] = exactIn 
      ? [baseToken, quoteToken] 
      : [quoteToken, baseToken];

    // Convert amount to token units with decimals
    const inputAmount = CurrencyAmount.fromRawAmount(
      inputToken,
      Math.floor(amount * Math.pow(10, inputToken.decimals)).toString()
    );

    // Create a route for the trade
    const route = new V2Route([pair], inputToken, outputToken);

    // Create the V2 trade
    const trade = new V2Trade(
      route,
      inputAmount,
      exactIn ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT
    );

    // Calculate slippage-adjusted amounts
    const slippageTolerance = slippagePct 
      ? new Percent(slippagePct, 100) 
      : uniswap.getAllowedSlippage(undefined, 'amm');

    const minAmountOut = exactIn
      ? trade.minimumAmountOut(slippageTolerance).quotient.toString()
      : inputAmount.quotient.toString();

    const maxAmountIn = exactIn
      ? inputAmount.quotient.toString()
      : trade.maximumAmountIn(slippageTolerance).quotient.toString();

    // Calculate amounts
    const estimatedAmountIn = exactIn
      ? formatTokenAmount(inputAmount.quotient.toString(), inputToken.decimals)
      : formatTokenAmount(trade.inputAmount.quotient.toString(), inputToken.decimals);

    const estimatedAmountOut = exactIn
      ? formatTokenAmount(trade.outputAmount.quotient.toString(), outputToken.decimals)
      : formatTokenAmount(inputAmount.quotient.toString(), outputToken.decimals);

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
    };
  } catch (error) {
    logger.error(`Error quoting AMM swap: ${error.message}`);
    throw error;
  }
}

async function formatSwapQuote(
  _fastify: FastifyInstance,
  chain: string,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  logger.info(`formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}`);
  
  const uniswap = await Uniswap.getInstance(chain, network);
  const ethereum = await Ethereum.getInstance(network);

  // Resolve tokens
  const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
  const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

  if (!baseTokenObj || !quoteTokenObj) {
    throw new Error(`Token not found: ${!baseTokenObj ? baseToken : quoteToken}`);
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
  
  logger.info(`Quote result: estimatedAmountIn=${quote.estimatedAmountIn}, estimatedAmountOut=${quote.estimatedAmountOut}`);

  // Calculate balance changes based on which tokens are being swapped
  const baseTokenBalanceChange = side === 'BUY' ? quote.estimatedAmountOut : -quote.estimatedAmountIn;
  const quoteTokenBalanceChange = side === 'BUY' ? -quote.estimatedAmountIn : quote.estimatedAmountOut;
  
  logger.info(`Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`);

  // Get gas estimate
  const estimatedGasValue = quote.trade.swaps[0].route.path.length * 150000; // Approximate gas per swap
  const gasPrice = await ethereum.provider.getGasPrice();
  
  // Convert estimatedGas to BigNumber for multiplication
  const estimatedGasBN = BigNumber.from(estimatedGasValue.toString());
  
  // Calculate gas cost
  const gasCostRaw = gasPrice.mul(estimatedGasBN);
  const gasCost = formatTokenAmount(gasCostRaw.toString(), 18); // ETH has 18 decimals

  // Calculate price
  const price = quote.estimatedAmountOut / quote.estimatedAmountIn;
  
  // Format gas price as Gwei
  const gasPriceGwei = formatTokenAmount(gasPrice.toString(), 9); // Convert to Gwei

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
            chain: { type: 'string', default: 'ethereum' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
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
        const chain = 'ethereum'; // Default to ethereum

        const uniswap = await Uniswap.getInstance(chain, networkToUse);
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
          chain,
          networkToUse,
          poolAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default quoteSwapRoute;
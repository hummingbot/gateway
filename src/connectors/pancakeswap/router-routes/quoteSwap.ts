import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import { PancakeswapQuoteSwapRequest, PancakeswapQuoteSwapResponse } from '../schemas';

async function quoteSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<Static<typeof PancakeswapQuoteSwapResponse>> {
  logger.info(`[quoteSwap] Starting quote generation`);
  logger.info(`[quoteSwap] Network: ${network}, Wallet: ${walletAddress}`);
  logger.info(`[quoteSwap] Base: ${baseToken}, Quote: ${quoteToken}`);
  logger.info(`[quoteSwap] Amount: ${amount}, Side: ${side}, Slippage: ${slippagePct}%`);

  const ethereum = await Ethereum.getInstance(network);
  const pancakeswap = await Pancakeswap.getInstance(network);

  // Resolve token symbols/addresses to token objects from local token list
  const baseTokenInfo = await ethereum.getToken(baseToken);
  const quoteTokenInfo = await ethereum.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    logger.error(`[quoteSwap] Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
    throw fastify.httpErrors.notFound(
      sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
    );
  }

  logger.info(`[quoteSwap] Base token: ${baseTokenInfo.symbol} (${baseTokenInfo.address})`);
  logger.info(`[quoteSwap] Quote token: ${quoteTokenInfo.symbol} (${quoteTokenInfo.address})`);

  // Convert to Pancakeswap SDK Token objects
  const baseTokenObj = pancakeswap.getPancakeswapToken(baseTokenInfo);
  const quoteTokenObj = pancakeswap.getPancakeswapToken(quoteTokenInfo);

  // Determine input/output based on side
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn ? [baseTokenObj, quoteTokenObj] : [quoteTokenObj, baseTokenObj];

  logger.info(`[quoteSwap] Input token: ${inputToken.symbol} (${inputToken.address})`);
  logger.info(`[quoteSwap] Output token: ${outputToken.symbol} (${outputToken.address})`);
  logger.info(`[quoteSwap] Exact in: ${exactIn}`);

  // Get quote from Universal Router
  logger.info(`[quoteSwap] Calling getUniversalRouterQuote...`);
  const quoteResult = await pancakeswap.getUniversalRouterQuote(inputToken, outputToken, amount, side, walletAddress);
  logger.info(`[quoteSwap] Quote result received`);

  // Generate unique quote ID
  const quoteId = uuidv4();
  logger.info(`[quoteSwap] Generated quote ID: ${quoteId}`);

  // Extract route information from quoteResult
  const routePath = quoteResult.routePath;
  logger.info(`[quoteSwap] Route path: ${routePath}`);

  // Calculate amounts based on quote
  let estimatedAmountIn: number;
  let estimatedAmountOut: number;

  if (exactIn) {
    estimatedAmountIn = amount;
    estimatedAmountOut = parseFloat(quoteResult.quote.toExact());
  } else {
    estimatedAmountIn = parseFloat(quoteResult.trade.inputAmount.toExact());
    estimatedAmountOut = amount;
  }

  logger.info(`[quoteSwap] Estimated amounts - In: ${estimatedAmountIn}, Out: ${estimatedAmountOut}`);

  const minAmountOut = side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : estimatedAmountOut;
  const maxAmountIn = side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : estimatedAmountIn;

  const price = estimatedAmountOut / estimatedAmountIn;
  logger.info(`[quoteSwap] Price: ${price}, Min out: ${minAmountOut}, Max in: ${maxAmountIn}`);

  // Cache the quote for execution
  // Store both quote and request data in the quote object for Pancakeswap
  const cachedQuote = {
    quote: {
      ...quoteResult,
      methodParameters: quoteResult.methodParameters,
    },
    request: {
      network,
      walletAddress: walletAddress,
      baseTokenInfo,
      quoteTokenInfo,
      inputToken,
      outputToken,
      amount,
      side,
      slippagePct,
    },
  };

  quoteCache.set(quoteId, cachedQuote);

  logger.info(
    `[quoteSwap] Cached quote ${quoteId}: ${estimatedAmountIn} ${inputToken.symbol} -> ${estimatedAmountOut} ${outputToken.symbol}`,
  );
  logger.info(`[quoteSwap] Method parameters available: ${!!quoteResult.methodParameters}`);
  if (quoteResult.methodParameters) {
    logger.info(`[quoteSwap] Calldata length: ${quoteResult.methodParameters.calldata.length}`);
    logger.info(`[quoteSwap] Value: ${quoteResult.methodParameters.value}`);
    logger.info(`[quoteSwap] To: ${quoteResult.methodParameters.to}`);
  }

  return {
    // Base QuoteSwapResponse fields in correct order
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    priceImpactPct: quoteResult.priceImpact,
    minAmountOut,
    maxAmountIn,
    // Pancakeswap-specific fields
    routePath,
  };
}

export { quoteSwap };

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  const chainConfig = getEthereumChainConfig();

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof PancakeswapQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get an executable swap quote from Pancakeswap Universal Router',
        tags: ['/connector/pancakeswap'],
        querystring: PancakeswapQuoteSwapRequest,
        response: { 200: PancakeswapQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network = chainConfig.defaultNetwork,
          walletAddress = chainConfig.defaultWallet,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
        } = request.query as typeof PancakeswapQuoteSwapRequest._type;

        return await quoteSwap(
          fastify,
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error getting quote:', e);
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

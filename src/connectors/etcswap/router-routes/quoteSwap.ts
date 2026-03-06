import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { getEthereumChainConfig } from '../../../chains/ethereum/ethereum.config';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ETCswap } from '../etcswap';
import { ETCswapConfig } from '../etcswap.config';
import { ETCswapQuoteSwapRequest, ETCswapQuoteSwapResponse } from '../schemas';

async function quoteSwap(
  network: string,
  walletAddress: string | undefined,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = ETCswapConfig.config.slippagePct,
): Promise<Static<typeof ETCswapQuoteSwapResponse>> {
  logger.info(`[ETCswap quoteSwap] Starting quote generation`);
  logger.info(`[ETCswap quoteSwap] Network: ${network}, Wallet: ${walletAddress || 'not provided'}`);
  logger.info(`[ETCswap quoteSwap] Base: ${baseToken}, Quote: ${quoteToken}`);
  logger.info(`[ETCswap quoteSwap] Amount: ${amount}, Side: ${side}, Slippage: ${slippagePct}%`);

  const ethereum = await Ethereum.getInstance(network);
  const etcswap = await ETCswap.getInstance(network);

  // Check if Universal Router is available
  if (!etcswap.hasUniversalRouter()) {
    throw httpErrors.badRequest(`ETCswap Universal Router not available on network: ${network}`);
  }

  // Resolve token symbols/addresses to token objects from local token list
  const baseTokenInfo = await ethereum.getToken(baseToken);
  const quoteTokenInfo = await ethereum.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    logger.error(`[ETCswap quoteSwap] Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
    throw httpErrors.notFound(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  logger.info(`[ETCswap quoteSwap] Base token: ${baseTokenInfo.symbol} (${baseTokenInfo.address})`);
  logger.info(`[ETCswap quoteSwap] Quote token: ${quoteTokenInfo.symbol} (${quoteTokenInfo.address})`);

  // Convert to SDK Token objects
  const baseTokenObj = etcswap.getETCswapToken(baseTokenInfo);
  const quoteTokenObj = etcswap.getETCswapToken(quoteTokenInfo);

  // Determine input/output based on side
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn ? [baseTokenObj, quoteTokenObj] : [quoteTokenObj, baseTokenObj];

  logger.info(`[ETCswap quoteSwap] Input token: ${inputToken.symbol} (${inputToken.address})`);
  logger.info(`[ETCswap quoteSwap] Output token: ${outputToken.symbol} (${outputToken.address})`);
  logger.info(`[ETCswap quoteSwap] Exact in: ${exactIn}`);

  // Get quote from Universal Router
  logger.info(`[ETCswap quoteSwap] Calling getUniversalRouterQuote...`);
  const quoteResult = await etcswap.getUniversalRouterQuote(inputToken, outputToken, amount, side, walletAddress);
  logger.info(`[ETCswap quoteSwap] Quote result received`);

  // Generate unique quote ID
  const quoteId = uuidv4();
  logger.info(`[ETCswap quoteSwap] Generated quote ID: ${quoteId}`);

  // Extract route information from quoteResult
  const routePath = quoteResult.routePath;
  logger.info(`[ETCswap quoteSwap] Route path: ${routePath}`);

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

  logger.info(`[ETCswap quoteSwap] Estimated amounts - In: ${estimatedAmountIn}, Out: ${estimatedAmountOut}`);

  const minAmountOut = side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : estimatedAmountOut;
  const maxAmountIn = side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : estimatedAmountIn;

  // Calculate price consistently as quote token per base token
  const price =
    side === 'SELL'
      ? estimatedAmountOut / estimatedAmountIn // SELL: quote per base
      : estimatedAmountIn / estimatedAmountOut; // BUY: quote per base
  logger.info(`[ETCswap quoteSwap] Price: ${price}, Min out: ${minAmountOut}, Max in: ${maxAmountIn}`);

  // Cache the quote for execution
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
    `[ETCswap quoteSwap] Cached quote ${quoteId}: ${estimatedAmountIn} ${inputToken.symbol} -> ${estimatedAmountOut} ${outputToken.symbol}`,
  );
  logger.info(`[ETCswap quoteSwap] Method parameters available: ${!!quoteResult.methodParameters}`);
  if (quoteResult.methodParameters) {
    logger.info(`[ETCswap quoteSwap] Calldata length: ${quoteResult.methodParameters.calldata.length}`);
    logger.info(`[ETCswap quoteSwap] Value: ${quoteResult.methodParameters.value}`);
    logger.info(`[ETCswap quoteSwap] To: ${quoteResult.methodParameters.to}`);
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
    // ETCswap-specific fields
    routePath,
  };
}

export { quoteSwap };

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  const chainConfig = getEthereumChainConfig();

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof ETCswapQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get an executable swap quote from ETCswap Universal Router',
        tags: ['/connector/etcswap'],
        querystring: ETCswapQuoteSwapRequest,
        response: { 200: ETCswapQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network = 'classic',
          walletAddress = chainConfig.defaultWallet,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
        } = request.query as typeof ETCswapQuoteSwapRequest._type;

        return await quoteSwap(
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
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default quoteSwapRoute;

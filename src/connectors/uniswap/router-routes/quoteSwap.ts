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
import { UniswapQuoteSwapRequest, UniswapQuoteSwapResponse } from '../schemas';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';

async function quoteSwap(
  network: string,
  walletAddress: string | undefined,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<Static<typeof UniswapQuoteSwapResponse>> {
  logger.info(`[quoteSwap] ${baseToken}/${quoteToken} ${side} ${amount} on ${network}`);
  logger.debug(`[quoteSwap] Wallet: ${walletAddress || 'not provided'}, Slippage: ${slippagePct}%`);

  const ethereum = await Ethereum.getInstance(network);
  const uniswap = await Uniswap.getInstance(network);

  // Resolve token symbols/addresses to token objects from local token list
  const baseTokenInfo = await ethereum.getToken(baseToken);
  const quoteTokenInfo = await ethereum.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    logger.error(`[quoteSwap] Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
    throw httpErrors.notFound(sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken));
  }

  logger.debug(`[quoteSwap] Base token: ${baseTokenInfo.symbol} (${baseTokenInfo.address})`);
  logger.debug(`[quoteSwap] Quote token: ${quoteTokenInfo.symbol} (${quoteTokenInfo.address})`);

  // Convert to Uniswap SDK Token objects
  const baseTokenObj = uniswap.getUniswapToken(baseTokenInfo);
  const quoteTokenObj = uniswap.getUniswapToken(quoteTokenInfo);

  // Determine input/output based on side
  const exactIn = side === 'SELL';
  const [inputToken, outputToken] = exactIn ? [baseTokenObj, quoteTokenObj] : [quoteTokenObj, baseTokenObj];

  logger.debug(`[quoteSwap] Input: ${inputToken.symbol}, Output: ${outputToken.symbol}, Exact in: ${exactIn}`);

  // Get quote from AlphaRouter (smart order router with split routing)
  // Use a placeholder address for quotes when no wallet is provided
  const recipient = walletAddress || '0x0000000000000000000000000000000000000001';
  const quoteResult = await uniswap.getAlphaRouterQuote(inputToken, outputToken, amount, side, recipient, slippagePct);

  // Generate unique quote ID
  const quoteId = uuidv4();

  // Extract route information from AlphaRouter result
  const routePath = quoteResult.routeString;

  // Get amounts from AlphaRouter result
  const estimatedAmountIn = parseFloat(quoteResult.inputAmount);
  const estimatedAmountOut = parseFloat(quoteResult.outputAmount);

  logger.debug(
    `[quoteSwap] Quote ${quoteId}: ${estimatedAmountIn} -> ${estimatedAmountOut}, gas: ${quoteResult.gasEstimate}`,
  );

  const minAmountOut = side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : estimatedAmountOut;
  const maxAmountIn = side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : estimatedAmountIn;

  // Calculate price consistently as quote token per base token
  const price =
    side === 'SELL'
      ? estimatedAmountOut / estimatedAmountIn // SELL: USDC per HBOT
      : estimatedAmountIn / estimatedAmountOut; // BUY: USDC per HBOT
  logger.debug(`[quoteSwap] Price: ${price}, Min out: ${minAmountOut}, Max in: ${maxAmountIn}`);

  // Cache the quote for execution
  // Store both quote and request data in the quote object for Uniswap
  // Include 'trade' at top level for compatibility with executeQuote
  const cachedQuote = {
    quote: {
      ...quoteResult,
      trade: quoteResult.route.trade, // Extract trade from SwapRoute for executeQuote compatibility
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
    `[quoteSwap] Quote ${quoteId}: ${estimatedAmountIn} ${inputToken.symbol} -> ${estimatedAmountOut} ${outputToken.symbol}`,
  );
  logger.debug(`[quoteSwap] Method parameters available: ${!!quoteResult.methodParameters}`);
  if (quoteResult.methodParameters) {
    logger.debug(
      `[quoteSwap] Calldata length: ${quoteResult.methodParameters.calldata.length}, To: ${quoteResult.methodParameters.to}`,
    );
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
    // Uniswap-specific fields
    routePath,
  };
}

export { quoteSwap };

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  const chainConfig = getEthereumChainConfig();

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof UniswapQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get an executable swap quote from Uniswap Universal Router',
        tags: ['/connector/uniswap'],
        querystring: UniswapQuoteSwapRequest,
        response: { 200: UniswapQuoteSwapResponse },
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
        } = request.query as typeof UniswapQuoteSwapRequest._type;

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

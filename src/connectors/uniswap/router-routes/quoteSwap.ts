import { Static } from '@sinclair/typebox';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { UniswapQuoteSwapResponse } from '../schemas';
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

  // Convert native token (ETH) to WETH for quote purposes
  // Native tokens aren't in the token list, but WETH has equivalent value
  const nativeSymbol = ethereum.nativeTokenSymbol.toUpperCase();
  const actualBaseToken = baseToken.toUpperCase() === nativeSymbol ? 'WETH' : baseToken;
  const actualQuoteToken = quoteToken.toUpperCase() === nativeSymbol ? 'WETH' : quoteToken;

  if (actualBaseToken !== baseToken || actualQuoteToken !== quoteToken) {
    logger.info(
      `[quoteSwap] Converted native token: ${baseToken}/${quoteToken} -> ${actualBaseToken}/${actualQuoteToken}`,
    );
  }

  // Handle same-token or equivalent-token quotes (return price=1)
  // This covers: USDC/USDC, ETH/WETH, WETH/ETH, ETH/ETH (after conversion)
  if (actualBaseToken.toUpperCase() === actualQuoteToken.toUpperCase()) {
    logger.info(`[quoteSwap] Same/equivalent token quote: ${baseToken}/${quoteToken}, returning price=1`);
    return {
      quoteId: uuidv4(),
      tokenIn: baseToken,
      tokenOut: quoteToken,
      amountIn: amount,
      amountOut: amount,
      price: 1,
      priceImpactPct: 0,
      minAmountOut: amount,
      maxAmountIn: amount,
      routePath: `${baseToken} -> ${quoteToken}`,
    };
  }

  // Resolve token symbols/addresses to token objects from local token list
  const baseTokenInfo = await ethereum.getToken(actualBaseToken);
  const quoteTokenInfo = await ethereum.getToken(actualQuoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    const missingToken = !baseTokenInfo ? actualBaseToken : actualQuoteToken;
    logger.error(`[quoteSwap] Token not found: ${missingToken}`);
    throw httpErrors.notFound(sanitizeErrorMessage('Token not found: {}', missingToken));
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

  // Use a placeholder address for quotes when no wallet is provided
  const recipient = walletAddress || '0x0000000000000000000000000000000000000001';

  // Normalized quote data (populated from AlphaRouter or Universal Router below)
  let routePath: string;
  let estimatedAmountIn: number;
  let estimatedAmountOut: number;
  let priceImpactPct: number;
  let trade: any;
  let methodParameters: { calldata: string; value: string; to: string } | undefined;
  let quoteResult: any;

  if (uniswap.isAlphaRouterAvailable()) {
    // Get quote from AlphaRouter (smart order router with split routing)
    quoteResult = await uniswap.getAlphaRouterQuote(inputToken, outputToken, amount, side, recipient, slippagePct);
    routePath = quoteResult.routeString;
    estimatedAmountIn = parseFloat(quoteResult.inputAmount);
    estimatedAmountOut = parseFloat(quoteResult.outputAmount);
    priceImpactPct = quoteResult.priceImpact;
    trade = quoteResult.route.trade; // Extract trade from SwapRoute for executeQuote compatibility
    methodParameters = quoteResult.methodParameters;
  } else {
    // The AlphaRouter SDK only supports chains hardcoded in @uniswap/smart-order-router;
    // on other networks (e.g. robinhoodchain) quote directly via the Universal Router
    logger.info(`[quoteSwap] AlphaRouter not available for ${network}, using Universal Router quote`);
    quoteResult = await uniswap.getUniversalRouterQuote(inputToken, outputToken, amount, side, recipient, slippagePct);
    routePath = quoteResult.routePath;
    estimatedAmountIn = parseFloat(quoteResult.trade.inputAmount.toExact());
    estimatedAmountOut = parseFloat(quoteResult.trade.outputAmount.toExact());
    priceImpactPct = quoteResult.priceImpact;
    trade = quoteResult.trade;
    methodParameters = quoteResult.methodParameters;
  }

  // Generate unique quote ID
  const quoteId = uuidv4();

  logger.debug(`[quoteSwap] Quote ${quoteId}: ${estimatedAmountIn} -> ${estimatedAmountOut}`);

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
      trade,
      methodParameters,
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
  logger.debug(`[quoteSwap] Method parameters available: ${!!methodParameters}`);
  if (methodParameters) {
    logger.debug(`[quoteSwap] Calldata length: ${methodParameters.calldata.length}, To: ${methodParameters.to}`);
  }

  return {
    // Base QuoteSwapResponse fields in correct order
    quoteId,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: estimatedAmountIn,
    amountOut: estimatedAmountOut,
    price,
    priceImpactPct,
    minAmountOut,
    maxAmountIn,
    // Uniswap-specific fields
    routePath,
  };
}

export { quoteSwap };

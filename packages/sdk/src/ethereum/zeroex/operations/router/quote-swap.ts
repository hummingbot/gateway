/**
 * 0x Quote Swap Operation
 *
 * High-level operation to get swap quotes from 0x API.
 * Supports both indicative pricing and firm quotes ready for execution.
 */

import { v4 as uuidv4 } from 'uuid';
import { ZeroXConnector } from '../../connector';
import { QuoteSwapParams, QuoteSwapResult } from '../../types';

export interface QuoteSwapDependencies {
  /** 0x connector instance */
  connector: ZeroXConnector;
  /** Function to resolve token symbol to address and decimals */
  getTokenInfo: (symbol: string) => { address: string; decimals: number; symbol: string } | undefined;
  /** Function to get example wallet address */
  getWalletAddressExample: () => Promise<string>;
  /** Quote cache for storing firm quotes */
  quoteCache?: {
    get: (quoteId: string) => any;
    set: (quoteId: string, quote: any, metadata: any) => void;
    delete: (quoteId: string) => void;
  };
}

/**
 * Execute a quote swap operation
 */
export async function quoteSwap(params: QuoteSwapParams, deps: QuoteSwapDependencies): Promise<QuoteSwapResult> {
  const {
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    indicativePrice = true,
    takerAddress,
  } = params;

  const { connector, getTokenInfo, getWalletAddressExample, quoteCache } = deps;

  // Resolve token symbols to addresses
  const baseTokenInfo = getTokenInfo(baseToken);
  const quoteTokenInfo = getTokenInfo(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw new Error(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
  }

  // Determine input/output based on side
  const sellToken = side === 'SELL' ? baseTokenInfo.address : quoteTokenInfo.address;
  const buyToken = side === 'SELL' ? quoteTokenInfo.address : baseTokenInfo.address;

  // Amount is always in base token units
  const amountDecimals = baseTokenInfo.decimals;

  // Convert amount to token units
  const tokenAmount = connector.parseTokenAmount(amount, amountDecimals);

  // Use provided taker address or example
  const walletAddress = takerAddress || (await getWalletAddressExample());

  // Get quote or price from 0x API based on indicativePrice flag
  let apiResponse: any;
  if (indicativePrice) {
    // Use price API for indicative quotes (no commitment)
    const priceParams: any = {
      sellToken,
      buyToken,
      takerAddress: walletAddress,
      slippagePercentage: slippagePct / 100,
      skipValidation: true,
    };

    if (side === 'SELL') {
      priceParams.sellAmount = tokenAmount;
    } else {
      priceParams.buyAmount = tokenAmount;
    }

    apiResponse = await connector.getPrice(priceParams);
  } else {
    // Use quote API for firm quotes (with commitment)
    const quoteParams: any = {
      sellToken,
      buyToken,
      takerAddress: walletAddress,
      slippagePercentage: slippagePct / 100,
      skipValidation: false,
    };

    if (side === 'SELL') {
      quoteParams.sellAmount = tokenAmount;
    } else {
      quoteParams.buyAmount = tokenAmount;
    }

    apiResponse = await connector.getQuote(quoteParams);
  }

  // Parse amounts
  const sellDecimals = side === 'SELL' ? baseTokenInfo.decimals : quoteTokenInfo.decimals;
  const buyDecimals = side === 'SELL' ? quoteTokenInfo.decimals : baseTokenInfo.decimals;

  const estimatedAmountIn = parseFloat(connector.formatTokenAmount(apiResponse.sellAmount, sellDecimals));
  const estimatedAmountOut = parseFloat(connector.formatTokenAmount(apiResponse.buyAmount, buyDecimals));

  // Calculate min/max amounts based on slippage
  const minAmountOut = side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : amount;
  const maxAmountIn = side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : amount;

  // Calculate price based on side
  const price = side === 'SELL' ? estimatedAmountOut / estimatedAmountIn : estimatedAmountIn / estimatedAmountOut;

  // Parse price impact
  const priceImpactPct = apiResponse.estimatedPriceImpact ? parseFloat(apiResponse.estimatedPriceImpact) * 100 : 0;

  // Generate quote ID and cache only for firm quotes
  let quoteId: string;
  let expirationTime: number | undefined;
  const now = Date.now();

  if (!indicativePrice) {
    // Only generate quote ID and cache for firm quotes
    quoteId = uuidv4();
    expirationTime = now + 30000; // 30 seconds TTL

    // Store the quote in global cache for later execution
    if (quoteCache) {
      quoteCache.set(quoteId, apiResponse, {
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        sellToken,
        buyToken,
        baseTokenInfo,
        quoteTokenInfo,
        walletAddress,
      });
    }
  } else {
    // For indicative prices, use a placeholder quote ID
    quoteId = 'indicative-price';
  }

  // Format gas estimate
  const gasEstimate = apiResponse.estimatedGas || apiResponse.gas || '300000';

  return {
    quoteId,
    tokenIn: sellToken,
    tokenOut: buyToken,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: side === 'SELL' ? estimatedAmountOut : amount,
    price,
    priceImpactPct,
    minAmountOut,
    maxAmountIn,
    gasEstimate,
    ...(expirationTime && { expirationTime }),
    // 0x-specific fields (only available for firm quotes)
    sources: apiResponse.sources,
    allowanceTarget: apiResponse.allowanceTarget,
    to: apiResponse.to,
    data: apiResponse.data,
    value: apiResponse.value,
  };
}

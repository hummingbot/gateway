import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ZeroX, ZeroXQuoteResponse } from '../0x';
import { ZeroXQuoteSwapRequest, ZeroXQuoteSwapResponse } from '../schemas';

// In-memory cache for quotes (with 30 second TTL)
const quoteCache = new Map<
  string,
  { quote: ZeroXQuoteResponse; timestamp: number; request: any }
>();
const QUOTE_TTL = 30000; // 30 seconds

// Cleanup expired quotes periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, cached] of quoteCache.entries()) {
    if (now - cached.timestamp > QUOTE_TTL) {
      quoteCache.delete(id);
    }
  }
}, 10000); // Run every 10 seconds

async function quoteSwap(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
  _gasPrice?: string,
  _excludedSources?: string[],
  _includedSources?: string[],
  skipValidation?: boolean,
  takerAddress?: string,
): Promise<Static<typeof ZeroXQuoteSwapResponse>> {
  const ethereum = await Ethereum.getInstance(network);
  const zeroX = await ZeroX.getInstance(network);

  // Resolve token symbols to addresses
  const baseTokenInfo = await ethereum.getTokenBySymbol(baseToken);
  const quoteTokenInfo = await ethereum.getTokenBySymbol(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      sanitizeErrorMessage(
        'Token not found: {}',
        !baseTokenInfo ? baseToken : quoteToken,
      ),
    );
  }

  // Determine input/output based on side
  const sellToken =
    side === 'SELL' ? baseTokenInfo.address : quoteTokenInfo.address;
  const buyToken =
    side === 'SELL' ? quoteTokenInfo.address : baseTokenInfo.address;
  const tokenDecimals =
    side === 'SELL' ? baseTokenInfo.decimals : quoteTokenInfo.decimals;

  // Convert amount to token units
  const tokenAmount = zeroX.parseTokenAmount(amount, tokenDecimals);

  // Use provided taker address or example
  const walletAddress =
    takerAddress || (await Ethereum.getWalletAddressExample());

  logger.info(
    `Getting quote for ${amount} ${side === 'SELL' ? baseToken : quoteToken} -> ${side === 'SELL' ? quoteToken : baseToken}`,
  );

  // Get quote from 0x API
  const quoteResponse = await zeroX.getQuote({
    sellToken,
    buyToken,
    sellAmount: side === 'SELL' ? tokenAmount : undefined,
    buyAmount: side === 'BUY' ? tokenAmount : undefined,
    takerAddress: walletAddress,
    slippagePercentage: zeroX.convertSlippageToPercentage(slippagePct),
    skipValidation: skipValidation || false,
  });

  // Parse amounts
  const sellDecimals =
    side === 'SELL' ? baseTokenInfo.decimals : quoteTokenInfo.decimals;
  const buyDecimals =
    side === 'SELL' ? quoteTokenInfo.decimals : baseTokenInfo.decimals;

  const estimatedAmountIn = parseFloat(
    zeroX.formatTokenAmount(quoteResponse.sellAmount, sellDecimals),
  );
  const estimatedAmountOut = parseFloat(
    zeroX.formatTokenAmount(quoteResponse.buyAmount, buyDecimals),
  );

  // Calculate min/max amounts based on slippage
  const minAmountOut =
    side === 'SELL' ? estimatedAmountOut * (1 - slippagePct / 100) : amount;
  const maxAmountIn =
    side === 'BUY' ? estimatedAmountIn * (1 + slippagePct / 100) : amount;

  // Calculate price based on side
  const price =
    side === 'SELL'
      ? estimatedAmountOut / estimatedAmountIn
      : estimatedAmountIn / estimatedAmountOut;

  // Calculate price with slippage
  // For SELL: worst price = minAmountOut / estimatedAmountIn (minimum quote per base)
  // For BUY: worst price = maxAmountIn / estimatedAmountOut (maximum quote per base)
  const priceWithSlippage =
    side === 'SELL'
      ? minAmountOut / estimatedAmountIn
      : maxAmountIn / estimatedAmountOut;

  // Parse price impact
  const priceImpactPct = quoteResponse.estimatedPriceImpact
    ? parseFloat(quoteResponse.estimatedPriceImpact) * 100
    : 0;

  // Generate quote ID and cache the quote
  const quoteId = uuidv4();
  const now = Date.now();

  quoteCache.set(quoteId, {
    quote: quoteResponse,
    timestamp: now,
    request: {
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
    },
  });

  // Format gas estimate
  const gasEstimate =
    quoteResponse.estimatedGas || quoteResponse.gas || '300000';

  return {
    quoteId,
    tokenIn: sellToken,
    tokenOut: buyToken,
    amountIn: side === 'SELL' ? amount : estimatedAmountIn,
    amountOut: side === 'SELL' ? estimatedAmountOut : amount,
    price,
    slippagePct,
    priceWithSlippage,
    minAmountOut,
    maxAmountIn,
    priceImpactPct,
    gasEstimate,
    expirationTime: now + QUOTE_TTL,
    // 0x-specific fields
    sources: quoteResponse.sources,
    allowanceTarget: quoteResponse.allowanceTarget,
    to: quoteResponse.to,
    data: quoteResponse.data,
    value: quoteResponse.value,
  };
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof ZeroXQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get an executable swap quote from 0x',
        tags: ['/connector/0x'],
        querystring: {
          ...ZeroXQuoteSwapRequest,
          properties: {
            ...ZeroXQuoteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', enum: ['BUY', 'SELL'] },
            slippagePct: { type: 'number', examples: [1] },
            takerAddress: { type: 'string', examples: [walletAddressExample] },
          },
        },
        response: { 200: ZeroXQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          gasPrice,
          excludedSources,
          includedSources,
          skipValidation,
          takerAddress,
        } = request.query as typeof ZeroXQuoteSwapRequest._type;

        return await quoteSwap(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          gasPrice,
          excludedSources,
          includedSources,
          skipValidation,
          takerAddress,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error getting quote:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

// Export quote cache for use in execute-quote
export { quoteCache };

export default quoteSwapRoute;

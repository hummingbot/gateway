import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetPriceRequestType,
  GetPriceResponseType,
  GetPriceResponse,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ZeroX } from '../0x';
import { ZeroXGetPriceRequest } from '../schemas';

async function getPrice(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  _gasPrice?: string,
  _excludedSources?: string[],
  _includedSources?: string[],
): Promise<GetPriceResponseType> {
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

  logger.info(
    `Getting price for ${amount} ${side === 'SELL' ? baseToken : quoteToken} -> ${side === 'SELL' ? quoteToken : baseToken}`,
  );

  // Get price from 0x API
  const priceResponse = await zeroX.getPrice({
    sellToken,
    buyToken,
    sellAmount: side === 'SELL' ? tokenAmount : undefined,
    buyAmount: side === 'BUY' ? tokenAmount : undefined,
    takerAddress: '0x0000000000000000000000000000000000000000', // Dummy address for price discovery
    slippagePercentage: 0.005, // 0.5% for price discovery
    skipValidation: true,
  });

  // Parse amounts
  const sellDecimals =
    side === 'SELL' ? baseTokenInfo.decimals : quoteTokenInfo.decimals;
  const buyDecimals =
    side === 'SELL' ? quoteTokenInfo.decimals : baseTokenInfo.decimals;

  const estimatedAmountIn = parseFloat(
    zeroX.formatTokenAmount(priceResponse.sellAmount, sellDecimals),
  );
  const estimatedAmountOut = parseFloat(
    zeroX.formatTokenAmount(priceResponse.buyAmount, buyDecimals),
  );

  // Calculate price based on side
  const price =
    side === 'SELL'
      ? estimatedAmountOut / estimatedAmountIn
      : estimatedAmountIn / estimatedAmountOut;

  // Parse price impact
  const priceImpactPct = priceResponse.estimatedPriceImpact
    ? parseFloat(priceResponse.estimatedPriceImpact) * 100
    : 0;

  return {
    estimatedAmountIn: side === 'SELL' ? amount : estimatedAmountIn,
    estimatedAmountOut: side === 'SELL' ? estimatedAmountOut : amount,
    price,
    priceImpactPct,
    tokenIn: sellToken,
    tokenOut: buyToken,
    tokenInAmount: estimatedAmountIn,
    tokenOutAmount: estimatedAmountOut,
  };
}

export const getPriceRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.get<{
    Querystring: GetPriceRequestType;
    Reply: GetPriceResponseType;
  }>(
    '/get-price',
    {
      schema: {
        description: 'Get an indicative price quote for a token swap on 0x',
        tags: ['/connector/0x'],
        querystring: {
          ...ZeroXGetPriceRequest,
          properties: {
            ...ZeroXGetPriceRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
          },
        },
        response: { 200: GetPriceResponse },
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
          gasPrice,
          excludedSources,
          includedSources,
        } = request.query as typeof ZeroXGetPriceRequest._type;

        return await getPrice(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          gasPrice,
          excludedSources,
          includedSources,
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error('Error getting price:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default getPriceRoute;

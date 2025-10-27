import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { ZeroXConnector, quoteSwap as sdkQuoteSwap } from '../../../../packages/sdk/src/ethereum/zeroex';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { QuoteSwapRequestType } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ZeroX } from '../0x';
import { ZeroXConfig } from '../0x.config';
import { ZeroXQuoteSwapRequest, ZeroXQuoteSwapResponse } from '../schemas';

// SDK imports

async function quoteSwap(
  _fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
  indicativePrice: boolean = true,
  takerAddress?: string,
): Promise<Static<typeof ZeroXQuoteSwapResponse>> {
  const ethereum = await Ethereum.getInstance(network);

  // Create SDK connector
  const connector = new ZeroXConnector({
    network,
    chainId: ethereum.chainId,
    apiKey: ZeroXConfig.config.apiKey,
    apiEndpoint: ZeroXConfig.getApiEndpoint(network),
    slippagePct: ZeroXConfig.config.slippagePct,
  });

  // Setup dependencies for SDK operation
  const deps = {
    connector,
    getTokenInfo: (symbol: string) => ethereum.getToken(symbol),
    getWalletAddressExample: async () => Ethereum.getWalletAddressExample(),
    quoteCache,
  };

  logger.info(
    `Getting ${indicativePrice ? 'indicative price' : 'firm quote'} for ${amount} ${baseToken} ${side === 'SELL' ? '->' : '<-'} ${quoteToken}`,
  );

  // Call SDK operation
  const result = await sdkQuoteSwap(
    {
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct,
      indicativePrice,
      takerAddress,
    },
    deps,
  );

  return result;
}

export { quoteSwap };

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteSwapRequestType;
    Reply: Static<typeof ZeroXQuoteSwapResponse>;
  }>(
    '/quote-swap',
    {
      schema: {
        description:
          'Get a swap quote from 0x. Use indicativePrice=true for price discovery only, or false/undefined for executable quotes',
        tags: ['/connector/0x'],
        querystring: ZeroXQuoteSwapRequest,
        response: { 200: ZeroXQuoteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side, slippagePct, indicativePrice, takerAddress } =
          request.query as typeof ZeroXQuoteSwapRequest._type;

        return await quoteSwap(
          fastify,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          indicativePrice ?? true,
          takerAddress,
        );
      } catch (e: any) {
        if (e.statusCode) throw e;
        logger.error('Error getting 0x quote:', e.message || e);

        // Handle specific error cases
        if (e.message?.includes('0x API key not configured')) {
          throw fastify.httpErrors.badRequest(e.message);
        }
        if (e.message?.includes('0x API Error')) {
          throw fastify.httpErrors.badRequest(e.message);
        }

        // Return the actual error message instead of generic one
        throw fastify.httpErrors.internalServerError(e.message || 'Failed to get quote');
      }
    },
  );
};

// Export quote cache for use in execute-quote
export { quoteCache };

export default quoteSwapRoute;

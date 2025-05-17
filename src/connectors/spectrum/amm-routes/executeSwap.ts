import { FastifyPluginAsync } from 'fastify';

import { Spectrum } from '../spectrum';
import {
  ExecuteSwapResponse,
  ExecuteSwapResponseType,
  ExecuteSwapRequest,
  ExecuteSwapRequestType,
} from '../../../schemas/trading-types/swap-schema';

const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute Spectrum swap',
        tags: ['spectrum/amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [0x0] },
            baseToken: { type: 'string', examples: ['ERG'] },
            quoteToken: { type: 'string', examples: ['SIGUSD'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
            poolAddress: { type: 'string', examples: [''] },
          },
        },
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      const {
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
      } = request.body;
      const connector: Spectrum = Spectrum.getInstance('ergo', network);
      return await connector.executeTrade({
        network: network || 'mainnet',
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side: side as 'BUY' | 'SELL',
        slippagePct,
      });
    },
  );
};

export default executeSwapRoute;

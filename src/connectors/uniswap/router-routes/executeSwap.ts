import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
// eslint-disable-next-line import/order
import { UniswapExecuteSwapRequest } from '../schemas';

// Import the quote and execute functions
import { UniswapConfig } from '../uniswap.config';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  logger.info(`Executing swap: ${amount} ${baseToken} ${side} for ${quoteToken}`);

  // Step 1: Get quote
  const quoteResponse = await quoteSwap(
    fastify,
    network,
    walletAddress,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
  );

  // Step 2: Execute the quote
  const executeResponse = await executeQuote(fastify, walletAddress, network, quoteResponse.quoteId);

  return executeResponse;
}

export { executeSwap };

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Quote and execute a token swap on Uniswap Universal Router in one step',
        tags: ['/connector/uniswap'],
        body: UniswapExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct } =
          request.body as typeof UniswapExecuteSwapRequest._type;

        return await executeSwap(
          fastify,
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { JupiterConfig } from '../jupiter.config';
import { JupiterExecuteSwapRequest } from '../schemas';

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
  slippagePct: number = JupiterConfig.config.slippagePct,
  priorityLevel?: string,
  maxLamports?: number,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh quote using the quoteSwap function
  const quoteResult = await quoteSwap(fastify, network, baseToken, quoteToken, amount, side, slippagePct);

  // Step 2: Execute the quote immediately using executeQuote function
  const executeResult = await executeQuote(
    fastify,
    walletAddress,
    network,
    quoteResult.quoteId,
    priorityLevel ?? JupiterConfig.config.priorityLevel,
    maxLamports ?? JupiterConfig.config.maxLamports,
  );

  return executeResult;
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
        description: 'Quote and execute a token swap on Jupiter in one step',
        tags: ['/connector/jupiter'],
        body: JupiterExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct, priorityLevel, maxLamports } =
          request.body as typeof JupiterExecuteSwapRequest._type;

        return await executeSwap(
          fastify,
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          priorityLevel,
          maxLamports,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ExecuteSwapRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
} from '../../../schemas/router-schema';
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
  slippagePct: number,
  priorityLevel?: string,
  maxLamports?: number,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh quote using the quoteSwap function
  const quoteResult = await quoteSwap(
    fastify,
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
  );

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

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Quote and execute a token swap on Jupiter in one step',
        tags: ['jupiter/swap'],
        body: {
          ...JupiterExecuteSwapRequest,
          properties: {
            ...JupiterExecuteSwapRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
          },
        },
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const {
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          priorityLevel,
          maxLamports,
        } = request.body as typeof JupiterExecuteSwapRequest._type;

        return await executeSwap(
          fastify,
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct ?? JupiterConfig.config.slippagePct,
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

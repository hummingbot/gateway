import { FastifyPluginAsync } from 'fastify';

import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { PancakeswapConfig } from '../pancakeswap.config';
import { PancakeswapExecuteSwapRequest } from '../schemas';

// Import the quote and execute functions
import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<SwapExecuteResponseType> {
  logger.info(`Executing swap: ${amount} ${baseToken} ${side} for ${quoteToken}`);

  // Step 1: Get quote
  const quoteResponse = await quoteSwap(network, walletAddress, baseToken, quoteToken, amount, side, slippagePct);

  // Step 2: Execute the quote
  const executeResponse = await executeQuote(walletAddress, network, quoteResponse.quoteId);

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
        description: 'Quote and execute a token swap on Pancakeswap Universal Router in one step',
        tags: ['/connector/pancakeswap'],
        body: PancakeswapExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct } =
          request.body as typeof PancakeswapExecuteSwapRequest._type;

        return await executeSwap(
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
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

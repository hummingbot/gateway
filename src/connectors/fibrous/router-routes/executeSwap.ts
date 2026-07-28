import { FastifyPluginAsync } from 'fastify';

import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { FibrousConfig } from '../fibrous.config';
import { FibrousExecuteSwapRequest } from '../schemas';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = FibrousConfig.config.slippagePct,
  gasPrice?: string,
  maxGas?: number,
  approximateIfNoExactOut: boolean = true,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh firm quote using the quoteSwap function
  const quoteResult = await quoteSwap(
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    false, // indicativePrice = false for firm quote
    walletAddress, // destination for the swap output
    approximateIfNoExactOut,
  );

  // Step 2: Execute the quote immediately using executeQuote function
  const executeResult = await executeQuote(walletAddress, network, quoteResult.quoteId, gasPrice, maxGas);

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
        description: 'Quote and execute a token swap on Fibrous in one step',
        tags: ['/connector/fibrous'],
        body: FibrousExecuteSwapRequest,
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
          gasPrice,
          maxGas,
          approximateIfNoExactOut,
        } = request.body as typeof FibrousExecuteSwapRequest._type;

        return await executeSwap(
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          gasPrice,
          maxGas,
          approximateIfNoExactOut ?? true,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing Fibrous swap:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

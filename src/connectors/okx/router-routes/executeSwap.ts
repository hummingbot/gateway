import { FastifyPluginAsync } from 'fastify';

import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { OkxConfig } from '../okx.config';
import { OkxExecuteSwapRequest } from '../schemas';

import { executeQuote } from './executeQuote';
import { quoteSwap } from './quoteSwap';

async function executeSwap(
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number = OkxConfig.config.slippagePct,
  approximateIfNoExactOut: boolean = true,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh quote
  const quoteResult = await quoteSwap(
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    approximateIfNoExactOut,
  );

  // Step 2: Execute the quote immediately
  return await executeQuote(walletAddress, network, quoteResult.quoteId);
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
        description: 'Quote and execute a token swap on the OKX DEX aggregator in one step',
        tags: ['/connector/okx'],
        body: OkxExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct, approximateIfNoExactOut } =
          request.body as typeof OkxExecuteSwapRequest._type;

        return await executeSwap(
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          approximateIfNoExactOut,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing OKX swap:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

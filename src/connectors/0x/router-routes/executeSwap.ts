import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { ExecuteSwapRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { ZeroXExecuteSwapRequest } from '../schemas';

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
  gasPrice?: string,
  maxGas?: number,
): Promise<SwapExecuteResponseType> {
  // Step 1: Get a fresh firm quote using the quoteSwap function
  const quoteResult = await quoteSwap(
    fastify,
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct,
    false, // indicativePrice = false for firm quote
    walletAddress, // takerAddress
  );

  // Step 2: Execute the quote immediately using executeQuote function
  const executeResult = await executeQuote(fastify, walletAddress, network, quoteResult.quoteId, gasPrice, maxGas);

  return executeResult;
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Quote and execute a token swap on 0x in one step',
        tags: ['/connector/0x'],
        body: ZeroXExecuteSwapRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, baseToken, quoteToken, amount, side, slippagePct, gasPrice, maxGas } =
          request.body as typeof ZeroXExecuteSwapRequest._type;

        return await executeSwap(
          fastify,
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          gasPrice,
          maxGas,
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

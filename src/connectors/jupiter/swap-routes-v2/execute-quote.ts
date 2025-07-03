import { Wallet } from '@coral-xyz/anchor';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ExecuteQuoteRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Jupiter } from '../jupiter';
import { JupiterExecuteQuoteRequest } from '../schemas';

import { quoteCache } from './get-quote';

async function executeQuote(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  quoteId: string,
  priorityFeeLamports?: number,
  computeUnits?: number,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId);
  if (!cached) {
    throw fastify.httpErrors.badRequest('Quote not found or expired');
  }

  const { quote, request } = cached;
  const { inputToken, outputToken, side, amount } = request;

  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);
  const keypair = await solana.getWallet(walletAddress);
  const wallet = new Wallet(keypair as any);

  logger.info(
    `Executing quote ${quoteId} for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Execute the swap
  const swapResult = await jupiter.executeSwap(
    wallet,
    quote,
    priorityFeeLamports
      ? priorityFeeLamports / (computeUnits || 300000)
      : undefined,
    computeUnits,
  );

  if (!swapResult.confirmed) {
    throw fastify.httpErrors.internalServerError('Transaction not confirmed');
  }

  const signature = swapResult.signature;
  const fee = swapResult.feeInLamports / 1e9;

  // Extract balance changes
  const { baseTokenBalanceChange, quoteTokenBalanceChange } =
    await solana.extractPairBalanceChangesAndFee(
      signature,
      request.baseToken,
      request.quoteToken,
      walletAddress,
    );

  // Calculate actual amounts swapped
  const totalInputSwapped =
    side === 'SELL'
      ? Math.abs(baseTokenBalanceChange)
      : Math.abs(quoteTokenBalanceChange);
  const totalOutputSwapped =
    side === 'SELL'
      ? Math.abs(quoteTokenBalanceChange)
      : Math.abs(baseTokenBalanceChange);

  logger.info(
    `Swap executed successfully: ${totalInputSwapped.toFixed(4)} ${inputToken.symbol} -> ${totalOutputSwapped.toFixed(4)} ${outputToken.symbol}`,
  );

  // Remove quote from cache after successful execution
  quoteCache.delete(quoteId);

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      totalInputSwapped,
      totalOutputSwapped,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      tokenInAmount: totalInputSwapped,
      tokenOutAmount: totalOutputSwapped,
    },
  };
}

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteQuoteRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched quote from Jupiter',
        tags: ['jupiter/swap'],
        body: {
          ...JupiterExecuteQuoteRequest,
          properties: {
            ...JupiterExecuteQuoteRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'mainnet-beta' },
            quoteId: {
              type: 'string',
              examples: ['123e4567-e89b-12d3-a456-426614174000'],
            },
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
          quoteId,
          priorityFeeLamports,
          computeUnits,
        } = request.body as typeof JupiterExecuteQuoteRequest._type;

        return await executeQuote(
          fastify,
          walletAddress,
          network,
          quoteId,
          priorityFeeLamports,
          computeUnits,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing quote:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

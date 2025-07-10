import { Wallet } from '@coral-xyz/anchor';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ExecuteQuoteRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
} from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { Jupiter } from '../jupiter';
import { JupiterExecuteQuoteRequest } from '../schemas';

export async function executeQuote(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  quoteId: string,
  priorityLevel?: string,
  maxLamports?: number,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const quote = quoteCache.get(quoteId);
  if (!quote) {
    throw fastify.httpErrors.badRequest('Quote not found or expired');
  }

  // Parse the quote to get token information
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  const inputToken = await solana.getToken(quote.inputMint || quote.inputToken);
  const outputToken = await solana.getToken(
    quote.outputMint || quote.outputToken,
  );

  if (!inputToken || !outputToken) {
    throw fastify.httpErrors.badRequest('Invalid tokens in quote');
  }

  const keypair = await solana.getWallet(walletAddress);
  const wallet = new Wallet(keypair as any);

  logger.info(
    `Executing quote ${quoteId} for ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Build the swap transaction
  const transaction = await jupiter.buildSwapTransaction(
    wallet,
    quote,
    maxLamports,
    priorityLevel,
  );

  // Send and confirm transaction using Solana's method
  const { confirmed, signature, txData } =
    await solana.sendAndConfirmRawTransaction(transaction);

  // Return with status
  if (confirmed && txData) {
    // Remove quote from cache only after successful execution (confirmed)
    quoteCache.delete(quoteId);

    // Transaction confirmed, return full data
    const { balanceChanges, fee } = await solana.extractBalanceChangesAndFee(
      signature,
      walletAddress,
      [inputToken.address, outputToken.address],
    );

    const inputTokenBalanceChange = balanceChanges[0];
    const outputTokenBalanceChange = balanceChanges[1];

    // Calculate actual amounts swapped
    const amountIn = Math.abs(inputTokenBalanceChange);
    const amountOut = Math.abs(outputTokenBalanceChange);

    // For router quotes, we don't have side information
    // So we return the raw balance changes
    const baseTokenBalanceChange = inputTokenBalanceChange;
    const quoteTokenBalanceChange = outputTokenBalanceChange;

    logger.info(
      `Swap executed successfully: ${amountIn.toFixed(4)} ${inputToken.symbol} -> ${amountOut.toFixed(4)} ${outputToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        tokenIn: inputToken.address,
        tokenOut: outputToken.address,
        amountIn,
        amountOut,
        fee,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
      },
    };
  } else {
    // Transaction pending, return for Hummingbot to handle retry
    logger.warn(
      `Transaction ${signature} not confirmed. May need higher priority fee.`,
    );

    return {
      signature,
      status: 0, // PENDING
      data: undefined, // No balance changes available for unconfirmed tx
    };
  }
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
            walletAddress: {
              ...JupiterExecuteQuoteRequest.properties.walletAddress,
              examples: [walletAddressExample],
            },
          },
        },
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, quoteId, priorityLevel, maxLamports } =
          request.body as typeof JupiterExecuteQuoteRequest._type;

        return await executeQuote(
          fastify,
          walletAddress,
          network,
          quoteId,
          priorityLevel,
          maxLamports,
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

import { Wallet } from '@coral-xyz/anchor';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { SolanaLedger } from '../../../chains/solana/solana-ledger';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { Jupiter } from '../jupiter';
import { JupiterExecuteQuoteRequest } from '../schemas';

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
  priorityLevel?: string,
  maxLamports?: number,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const quote = quoteCache.get(quoteId);
  if (!quote) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  // Parse the quote to get token information
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);

  const inputToken = await solana.getToken(quote.inputMint || quote.inputToken);
  const outputToken = await solana.getToken(quote.outputMint || quote.outputToken);

  if (!inputToken || !outputToken) {
    throw httpErrors.badRequest('Invalid tokens in quote');
  }

  // Check if this is a hardware wallet
  const isHardwareWallet = await solana.isHardwareWallet(walletAddress);
  let transaction;

  if (isHardwareWallet) {
    // For hardware wallets, we need to build the transaction with the actual public key
    // but sign it separately with Ledger
    logger.info(`Hardware wallet detected for ${walletAddress}. Building transaction for Ledger signing.`);

    // Jupiter needs to build the transaction with the actual user's public key
    // We'll pass the hardware wallet address to Jupiter's buildSwapTransactionForHardwareWallet
    logger.info(`Executing quote ${quoteId} for ${inputToken.symbol} -> ${outputToken.symbol} with hardware wallet`);

    // Build the swap transaction for hardware wallet
    transaction = await jupiter.buildSwapTransactionForHardwareWallet(walletAddress, quote, maxLamports, priorityLevel);

    // Now sign with Ledger
    const ledger = new SolanaLedger();
    transaction = await ledger.signTransaction(walletAddress, transaction);
  } else {
    // Regular wallet flow
    const keypair = await solana.getWallet(walletAddress);
    const wallet = new Wallet(keypair as any);

    logger.info(`Executing quote ${quoteId} for ${inputToken.symbol} -> ${outputToken.symbol}`);

    // Build the swap transaction (will be signed by Jupiter)
    transaction = await jupiter.buildSwapTransaction(wallet, quote, maxLamports, priorityLevel);
  }

  // Simulate transaction with proper error handling before sending
  await solana.simulateWithErrorHandling(transaction);

  // Send and confirm transaction using Solana's method
  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  // Handle confirmation status
  const result = await solana.handleConfirmation(
    signature,
    confirmed,
    txData,
    inputToken.address,
    outputToken.address,
    walletAddress,
  );

  // Remove quote from cache only after successful execution (confirmed)
  if (result.status === 1) {
    quoteCache.delete(quoteId);
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${inputToken.symbol} -> ${result.data?.amountOut.toFixed(4)} ${outputToken.symbol}`,
    );
  }

  return result as SwapExecuteResponseType;
}

export const executeQuoteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ExecuteQuoteRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-quote',
    {
      schema: {
        description: 'Execute a previously fetched quote from Jupiter',
        tags: ['/connector/jupiter'],
        body: JupiterExecuteQuoteRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, quoteId, priorityLevel, maxLamports } =
          request.body as typeof JupiterExecuteQuoteRequest._type;

        return await executeQuote(walletAddress, network, quoteId, priorityLevel, maxLamports);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing quote:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

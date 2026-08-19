import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteQuoteRequestType, SwapExecuteResponseType, SwapExecuteResponse } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { TitanExecuteQuoteRequest } from '../schemas';
import { buildVersionedTransactionFromInstructions } from '../titan.utils';

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  // Retrieve cached quote
  const cached = quoteCache.get(quoteId);
  if (!cached || cached.connector !== 'titan') {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const { wallet, inputToken, outputToken, swapRoute, slippagePct } = cached;

  // Titan instructions are built for a specific wallet; executing them from another wallet
  // would fail on-chain or move the wrong accounts — require a re-quote instead
  if (walletAddress !== wallet) {
    throw httpErrors.badRequest(
      `Quote ${quoteId} was created for wallet ${wallet}; re-quote with walletAddress=${walletAddress}`,
    );
  }

  const solana = await Solana.getInstance(network);

  // Compile the swap UNSIGNED from the cached instructions + address lookup tables with a
  // fresh blockhash, then sign + send via the wallet-type-aware chokepoint (local keypair /
  // Ledger) — no per-wallet-type branching here.
  logger.info(`Executing Titan quote ${quoteId} for ${inputToken.symbol} -> ${outputToken.symbol}`);
  const transaction = await buildVersionedTransactionFromInstructions(
    solana.connection,
    walletAddress,
    swapRoute.instructions,
    swapRoute.addressLookupTables,
  );

  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Re-fetch with retry; a landed-but-failed transaction throws instead of being
  // misreported as confirmed or pending.
  const txData = await solana.getConfirmedTransactionData(signature);

  const result = await solana.handleConfirmation(
    signature,
    txData,
    inputToken.address,
    outputToken.address,
    walletAddress,
    undefined,
    slippagePct,
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
        description: 'Execute a previously fetched quote from Titan (DART)',
        tags: ['/connector/titan'],
        body: TitanExecuteQuoteRequest,
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, network, quoteId } = request.body as typeof TitanExecuteQuoteRequest._type;

        return await executeQuote(walletAddress, network, quoteId);
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing Titan quote:', e);
        throw httpErrors.internalServerError(e.message || 'Internal server error');
      }
    },
  );
};

export default executeQuoteRoute;

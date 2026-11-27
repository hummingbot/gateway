import { VersionedTransaction } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { HelmswapApiError } from '../../helmswap/helmswap-api';
import { HelmswapSol } from '../helmswap-sol';

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  const cached = quoteCache.get(quoteId, 'helmswap-sol');
  if (!cached) {
    throw httpErrors.badRequest('Quote not found or expired');
  }
  const request = quoteCache.getRequest(quoteId, 'helmswap-sol') as {
    params: any;
    inputToken: { symbol: string; address: string };
    outputToken: { symbol: string; address: string };
    slippagePct?: number;
  };
  if (!request?.params) {
    throw httpErrors.badRequest('Quote request metadata not found or expired');
  }

  const solana = await Solana.getInstance(network);
  const helm = await HelmswapSol.getInstance(network);

  logger.info(`Building and executing HelmSwap Solana quote ${quoteId}`);

  let built: Record<string, unknown>;
  try {
    built = await helm.api.buildTx(request.params, cached, walletAddress);
  } catch (err) {
    if (err instanceof HelmswapApiError) {
      throw httpErrors.badRequest(err.message);
    }
    throw err;
  }

  const tx = built.tx as { transactionBase64?: string } | undefined;
  if (!tx?.transactionBase64) {
    throw httpErrors.internalServerError('HelmSwap build-tx returned no unsigned Solana transaction.');
  }

  const transaction = VersionedTransaction.deserialize(Buffer.from(tx.transactionBase64, 'base64'));
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await solana.getConfirmedTransactionData(signature);
  const result = await solana.handleConfirmation(
    signature,
    txData,
    request.inputToken.address,
    request.outputToken.address,
    walletAddress,
    undefined,
    request.slippagePct,
  );

  if (result.status === 1) {
    quoteCache.delete(quoteId);
    logger.info(
      `HelmSwap Solana swap confirmed: ${result.data?.amountIn} ${request.inputToken.symbol} -> ${result.data?.amountOut} ${request.outputToken.symbol}`,
    );
  }

  return result as SwapExecuteResponseType;
}

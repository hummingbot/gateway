import { Ethereum } from '../../../chains/ethereum/ethereum';
import { SwapExecuteResponseType } from '../../../schemas/router-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { quoteCache } from '../../../services/quote-cache';
import { Helmswap } from '../helmswap';
import { HelmswapApiError } from '../helmswap-api';

export async function executeQuote(
  walletAddress: string,
  network: string,
  quoteId: string,
): Promise<SwapExecuteResponseType> {
  const cached = quoteCache.get(quoteId, 'helmswap');
  if (!cached) {
    throw httpErrors.badRequest('Quote not found or expired');
  }

  const request = quoteCache.getRequest(quoteId, 'helmswap') as {
    params: any;
    baseTokenInfo: { symbol: string; address: string; decimals: number };
    quoteTokenInfo: { symbol: string; address: string; decimals: number };
    slippagePct?: number;
  };
  if (!request?.params) {
    throw httpErrors.badRequest('Quote request metadata not found or expired');
  }

  const ethereum = await Ethereum.getInstance(network);
  const helm = await Helmswap.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);

  logger.info(`Building and executing HelmSwap quote ${quoteId} on ${network}`);

  let built: Record<string, unknown>;
  try {
    built = await helm.api.buildTx(request.params, cached, walletAddress);
  } catch (err) {
    if (err instanceof HelmswapApiError) {
      throw httpErrors.badRequest(err.message);
    }
    throw err;
  }

  const approvals = Array.isArray(built.approvals)
    ? (built.approvals as Array<{ to: string; data: string; value?: string }>)
    : [];
  for (const approval of approvals) {
    const approvalTx = await wallet.sendTransaction({
      to: approval.to,
      data: approval.data,
      value: approval.value || '0x0',
    });
    await ethereum.handleTransactionExecution(approvalTx);
  }

  const tx = built.tx as { to: string; data: string; value?: string } | undefined;
  if (!tx?.to || !tx?.data) {
    throw httpErrors.internalServerError('HelmSwap build-tx returned no unsigned transaction.');
  }

  const txResponse = await wallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value || '0x0',
  });
  const txReceipt = await ethereum.handleTransactionExecution(txResponse);

  const sellInfo = request.baseTokenInfo;
  const buyInfo = request.quoteTokenInfo;
  const expectedIn = parseFloat(helm.formatTokenAmount(String(request.params.amountIn), sellInfo.decimals));
  const inner = (cached.quote ?? {}) as Record<string, unknown>;
  const net = String(inner.netOutAmount ?? cached.netOutAmount ?? '');
  const expectedOut = net ? parseFloat(helm.formatTokenAmount(net, buyInfo.decimals)) : expectedIn;

  const result = ethereum.handleExecuteQuoteTransactionConfirmation(
    txReceipt,
    sellInfo.address,
    buyInfo.address,
    expectedIn,
    expectedOut,
    undefined,
    undefined,
    request.slippagePct,
  );

  if (result.status === -1) {
    throw httpErrors.internalServerError('Transaction failed on-chain');
  }
  if (result.status === 0) {
    logger.info(`Transaction ${result.signature || 'pending'} is still pending`);
    return result;
  }

  quoteCache.delete(quoteId);
  logger.info(`HelmSwap swap confirmed: ${expectedIn} ${sellInfo.symbol} -> ${expectedOut} ${buyInfo.symbol}`);
  return result;
}

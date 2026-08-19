import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponseType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';

import { getRawSwapQuote } from './quoteSwap';

export async function executeSwap(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  side: 'BUY' | 'SELL',
  amount: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Set the SDK owner to the wallet's public key — works for every wallet type (local,
  // hardware). The tx is built unsigned; signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which signs for the wallet's type.
  await raydium.setOwner(new PublicKey(walletAddress));

  // Get pool info from address
  const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  // Derive the counter ("quote") token from the pool given the requested base token.
  const baseTokenInfo = await solana.getToken(baseToken);
  const resolvedBaseAddress = baseTokenInfo ? baseTokenInfo.address : baseToken;
  let quoteToken: string;
  if (resolvedBaseAddress === poolInfo.baseTokenAddress) {
    quoteToken = poolInfo.quoteTokenAddress;
  } else if (resolvedBaseAddress === poolInfo.quoteTokenAddress) {
    quoteToken = poolInfo.baseTokenAddress;
  } else {
    throw httpErrors.badRequest(`Base token ${baseToken} is not in pool ${poolAddress}`);
  }

  // Use configured slippage if not provided
  const effectiveSlippage = slippagePct;

  // Get swap quote
  const quote = await getRawSwapQuote(
    raydium,
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side,
    effectiveSlippage,
  );

  const inputToken = quote.inputToken;
  const outputToken = quote.outputToken;

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`);

  // Use hardcoded compute units for AMM swaps
  const COMPUTE_UNITS = 300000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);
  let transaction: VersionedTransaction;

  // Get transaction based on pool type
  if (poolInfo.poolType === 'amm') {
    if (side === 'BUY') {
      // AMM swap base out (exact output)
      ({ transaction } = (await raydium.raydiumSDK.liquidity.swap({
        poolInfo: quote.poolInfo,
        poolKeys: quote.poolKeys,
        amountIn: quote.maxAmountIn,
        amountOut: new BN(quote.amountOut),
        fixedSide: 'out',
        inputMint: inputToken.address,
        txVersion: raydium.txVersion,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      })) as { transaction: VersionedTransaction });
    } else {
      // AMM swap (exact input)
      ({ transaction } = (await raydium.raydiumSDK.liquidity.swap({
        poolInfo: quote.poolInfo,
        poolKeys: quote.poolKeys,
        amountIn: new BN(quote.amountIn),
        amountOut: quote.minAmountOut,
        fixedSide: 'in',
        inputMint: inputToken.address,
        txVersion: raydium.txVersion,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      })) as { transaction: VersionedTransaction });
    }
  } else if (poolInfo.poolType === 'cpmm') {
    if (side === 'BUY') {
      // CPMM swap base out (exact output)
      ({ transaction } = (await raydium.raydiumSDK.cpmm.swap({
        poolInfo: quote.poolInfo,
        poolKeys: quote.poolKeys,
        inputAmount: new BN(0), // not used when fixedOut is true
        fixedOut: true,
        swapResult: {
          sourceAmountSwapped: quote.amountIn,
          destinationAmountSwapped: new BN(quote.amountOut),
        },
        slippage: effectiveSlippage / 100,
        baseIn: inputToken.address === quote.poolInfo.mintA.address,
        txVersion: raydium.txVersion,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      })) as { transaction: VersionedTransaction });
    } else {
      // CPMM swap (exact input)
      ({ transaction } = (await raydium.raydiumSDK.cpmm.swap({
        poolInfo: quote.poolInfo,
        poolKeys: quote.poolKeys,
        inputAmount: quote.amountIn,
        swapResult: {
          sourceAmountSwapped: quote.amountIn,
          destinationAmountSwapped: quote.amountOut,
        },
        slippage: effectiveSlippage / 100,
        baseIn: inputToken.address === quote.poolInfo.mintA.address,
        txVersion: raydium.txVersion,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      })) as { transaction: VersionedTransaction });
    }
  } else {
    throw new Error(`Unsupported pool type: ${poolInfo.poolType}`);
  }

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
  // simulates internally).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Re-fetch with retry; a landed-but-failed transaction throws instead of being
  // misreported as confirmed or pending.
  const txData = await solana.getConfirmedTransactionData(signature);

  // Handle confirmation status
  const result = await solana.handleConfirmation(
    signature,
    txData,
    inputToken.address,
    outputToken.address,
    walletAddress,
    side,
    effectiveSlippage,
  );

  if (result.status === 1) {
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${inputToken.symbol} -> ${result.data?.amountOut.toFixed(4)} ${outputToken.symbol}`,
    );
  }

  return result as ExecuteSwapResponseType;
}

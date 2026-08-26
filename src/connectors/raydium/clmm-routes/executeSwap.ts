import { ReturnTypeComputeAmountOutFormat, ReturnTypeComputeAmountOutBaseOut } from '@raydium-io/raydium-sdk-v2';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';

import { getSwapQuote, resolveCounterToken } from './quoteSwap';

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

  // Standardized: quote token is derived from the pool given poolAddress + baseToken.
  const quoteToken = await resolveCounterToken(network, poolAddress, baseToken);

  // Get pool info from address
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const { inputToken, outputToken, response, clmmPoolInfo } = await getSwapQuote(
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    poolAddress,
    slippagePct,
  );

  logger.info(`Raydium CLMM getSwapQuote:`, {
    response:
      side === 'BUY'
        ? {
            amountIn: {
              amount: (response as ReturnTypeComputeAmountOutBaseOut).amountIn.amount.toNumber(),
            },
            maxAmountIn: {
              amount: (response as ReturnTypeComputeAmountOutBaseOut).maxAmountIn.amount.toNumber(),
            },
            realAmountOut: {
              amount: (response as ReturnTypeComputeAmountOutBaseOut).realAmountOut.amount.toNumber(),
            },
          }
        : {
            realAmountIn: {
              amount: {
                raw: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.raw.toNumber(),
                token: {
                  symbol: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.token.symbol,
                  mint: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.token.mint,
                  decimals: (response as ReturnTypeComputeAmountOutFormat).realAmountIn.amount.token.decimals,
                },
              },
            },
            amountOut: {
              amount: {
                raw: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.raw.toNumber(),
                token: {
                  symbol: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.token.symbol,
                  mint: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.token.mint,
                  decimals: (response as ReturnTypeComputeAmountOutFormat).amountOut.amount.token.decimals,
                },
              },
            },
            minAmountOut: {
              amount: {
                numerator: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.raw.toNumber(),
                token: {
                  symbol: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.token.symbol,
                  mint: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.token.mint,
                  decimals: (response as ReturnTypeComputeAmountOutFormat).minAmountOut.amount.token.decimals,
                },
              },
            },
          },
  });

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`);

  // Use hardcoded compute units for CLMM swaps
  const COMPUTE_UNITS = 600000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction with SDK - pass parameters directly
  let transaction: VersionedTransaction;
  if (side === 'BUY') {
    const exactOutResponse = response as ReturnTypeComputeAmountOutBaseOut;
    // maxAmountIn already includes slippage (SDK computed it from the slippage
    // passed to computeAmountIn) and is denominated in the input token's units.
    ({ transaction } = (await raydium.raydiumSDK.clmm.swapBaseOut({
      poolInfo,
      poolKeys,
      outputMint: outputToken.address,
      amountInMax: exactOutResponse.maxAmountIn.amount,
      amountOut: exactOutResponse.realAmountOut.amount,
      observationId: clmmPoolInfo.observationId,
      ownerInfo: {
        useSOLBalance: true,
      },
      txVersion: raydium.txVersion,
      remainingAccounts: exactOutResponse.remainingAccounts,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    })) as { transaction: VersionedTransaction });
  } else {
    const exactInResponse = response as ReturnTypeComputeAmountOutFormat;
    ({ transaction } = (await raydium.raydiumSDK.clmm.swap({
      poolInfo,
      poolKeys,
      inputMint: inputToken.address,
      amountIn: exactInResponse.realAmountIn.amount.raw,
      amountOutMin: exactInResponse.minAmountOut.amount.raw,
      observationId: clmmPoolInfo.observationId,
      ownerInfo: {
        useSOLBalance: true,
      },
      remainingAccounts: exactInResponse.remainingAccounts,
      txVersion: raydium.txVersion,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    })) as { transaction: VersionedTransaction });
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
    slippagePct,
  );

  if (result.status === 1) {
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${inputToken.symbol} -> ${result.data?.amountOut.toFixed(4)} ${outputToken.symbol}`,
    );
  }

  return result as ExecuteSwapResponseType;
}

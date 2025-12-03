import { ReturnTypeComputeAmountOutFormat, ReturnTypeComputeAmountOutBaseOut } from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponse, ExecuteSwapResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumClmmExecuteSwapRequest, RaydiumClmmExecuteSwapRequestType } from '../schemas';

import { getSwapQuote, convertAmountIn } from './quoteSwap';

export async function executeSwap(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

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
    const amountIn = convertAmountIn(
      amount,
      inputToken.decimals,
      outputToken.decimals,
      exactOutResponse.amountIn.amount,
    );
    const amountInWithSlippage = amountIn * 10 ** inputToken.decimals * (1 + slippagePct / 100);
    // logger.info(`amountInWithSlippage: ${amountInWithSlippage}`);
    ({ transaction } = (await raydium.raydiumSDK.clmm.swapBaseOut({
      poolInfo,
      poolKeys,
      outputMint: outputToken.address,
      amountInMax: new BN(Math.floor(amountInWithSlippage)),
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

  // Sign transaction using helper
  transaction = (await raydium.signTransaction(
    transaction,
    walletAddress,
    isHardwareWallet,
    wallet,
  )) as VersionedTransaction;

  // Simulate transaction with proper error handling
  await solana.simulateWithErrorHandling(transaction as VersionedTransaction);

  // Send and confirm - keep retry loop here for retrying same tx hash
  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  // Handle confirmation status
  const result = await solana.handleConfirmation(
    signature,
    confirmed,
    txData,
    inputToken.address,
    outputToken.address,
    walletAddress,
    side,
  );

  if (result.status === 1) {
    logger.info(
      `Swap executed successfully: ${result.data?.amountIn.toFixed(4)} ${inputToken.symbol} -> ${result.data?.amountOut.toFixed(4)} ${outputToken.symbol}`,
    );
  }

  return result as ExecuteSwapResponseType;
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RaydiumClmmExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Raydium CLMM',
        tags: ['/connector/raydium'],
        body: RaydiumClmmExecuteSwapRequest,
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body;
        const networkToUse = network;

        // If no pool address provided, find default pool
        let poolAddressToUse = poolAddress;
        if (!poolAddressToUse) {
          const solana = await Solana.getInstance(networkToUse);

          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw httpErrors.badRequest(
              sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'raydium',
            networkToUse,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Raydium`,
            );
          }

          poolAddressToUse = pool.address;
        }

        return await executeSwap(
          networkToUse,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressToUse,
          slippagePct,
        );
      } catch (e) {
        // Preserve the original error if it's a FastifyError
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to get swap quote');
      }
    },
  );
};

export default executeSwapRoute;

import {
  ReturnTypeComputeAmountOutFormat,
  ReturnTypeComputeAmountOutBaseOut,
} from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana, BASE_FEE } from '../../../chains/solana/solana';
import {
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
  ExecuteSwapRequest,
  ExecuteSwapRequestType,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

import { getSwapQuote, convertAmountIn } from './quoteSwap';

async function executeSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number,
  priorityFeePerCU?: number,
  computeUnits?: number,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  // Get pool info from address
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }
  console.log('poolInfo', poolInfo);
  console.log('poolKeys', poolKeys);

  // Use configured slippage if not provided
  const effectiveSlippage = slippagePct || raydium.getSlippagePct();

  const { inputToken, outputToken, response, clmmPoolInfo } =
    await getSwapQuote(
      fastify,
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      poolAddress,
      effectiveSlippage,
    );

  logger.info(`Raydium CLMM getSwapQuote:`, {
    response:
      side === 'BUY'
        ? {
            amountIn: {
              amount: (
                response as ReturnTypeComputeAmountOutBaseOut
              ).amountIn.amount.toNumber(),
            },
            maxAmountIn: {
              amount: (
                response as ReturnTypeComputeAmountOutBaseOut
              ).maxAmountIn.amount.toNumber(),
            },
            realAmountOut: {
              amount: (
                response as ReturnTypeComputeAmountOutBaseOut
              ).realAmountOut.amount.toNumber(),
            },
          }
        : {
            realAmountIn: {
              amount: {
                raw: (
                  response as ReturnTypeComputeAmountOutFormat
                ).realAmountIn.amount.raw.toNumber(),
                token: {
                  symbol: (response as ReturnTypeComputeAmountOutFormat)
                    .realAmountIn.amount.token.symbol,
                  mint: (response as ReturnTypeComputeAmountOutFormat)
                    .realAmountIn.amount.token.mint,
                  decimals: (response as ReturnTypeComputeAmountOutFormat)
                    .realAmountIn.amount.token.decimals,
                },
              },
            },
            amountOut: {
              amount: {
                raw: (
                  response as ReturnTypeComputeAmountOutFormat
                ).amountOut.amount.raw.toNumber(),
                token: {
                  symbol: (response as ReturnTypeComputeAmountOutFormat)
                    .amountOut.amount.token.symbol,
                  mint: (response as ReturnTypeComputeAmountOutFormat).amountOut
                    .amount.token.mint,
                  decimals: (response as ReturnTypeComputeAmountOutFormat)
                    .amountOut.amount.token.decimals,
                },
              },
            },
            minAmountOut: {
              amount: {
                numerator: (
                  response as ReturnTypeComputeAmountOutFormat
                ).minAmountOut.amount.raw.toNumber(),
                token: {
                  symbol: (response as ReturnTypeComputeAmountOutFormat)
                    .minAmountOut.amount.token.symbol,
                  mint: (response as ReturnTypeComputeAmountOutFormat)
                    .minAmountOut.amount.token.mint,
                  decimals: (response as ReturnTypeComputeAmountOutFormat)
                    .minAmountOut.amount.token.decimals,
                },
              },
            },
          },
  });

  logger.info(
    `Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`,
  );

  // Use provided compute units or default
  const COMPUTE_UNITS = computeUnits || 600000;

  // Use provided priority fee per CU or estimate default
  let finalPriorityFeePerCU: number;
  if (priorityFeePerCU !== undefined) {
    finalPriorityFeePerCU = priorityFeePerCU;
  } else {
    // Calculate default if not provided
    const currentPriorityFee = (await solana.estimateGas()) * 1e9 - BASE_FEE;
    finalPriorityFeePerCU = Math.floor(
      (currentPriorityFee * 1e6) / COMPUTE_UNITS,
    );
  }

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
    const amountInWithSlippage =
      amountIn * 10 ** inputToken.decimals * (1 + effectiveSlippage / 100);
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
        microLamports: finalPriorityFeePerCU, // Pass directly without transformation
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
        microLamports: finalPriorityFeePerCU, // Pass directly without transformation
      },
    })) as { transaction: VersionedTransaction });
  }

  // Sign and simulate transaction
  transaction.sign([wallet]);
  await solana.simulateTransaction(transaction as VersionedTransaction);

  // Send and confirm - keep retry loop here for retrying same tx hash
  const { confirmed, signature, txData } =
    await solana.sendAndConfirmRawTransaction(transaction);

  if (confirmed && txData) {
    // Return confirmed with full data
    const { baseTokenBalanceChange, quoteTokenBalanceChange } =
      await solana.extractPairBalanceChangesAndFee(
        signature,
        await solana.getToken(poolInfo.mintA.address),
        await solana.getToken(poolInfo.mintB.address),
        wallet.publicKey.toBase58(),
      );

    logger.info(
      `Swap executed successfully: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        totalInputSwapped: Math.abs(baseTokenBalanceChange),
        totalOutputSwapped: Math.abs(quoteTokenBalanceChange),
        fee: txData.meta.fee / 1e9,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
      },
    };
  } else {
    // Return pending for Hummingbot to handle retry
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const firstWalletAddress = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Raydium CLMM',
        tags: ['raydium/clmm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          poolAddress,
          slippagePct,
          priorityFeePerCU,
          computeUnits,
        } = request.body;
        const networkToUse = network;

        // If no pool address provided, find default pool
        let poolAddressToUse = poolAddress;
        if (!poolAddressToUse) {
          const solana = await Solana.getInstance(networkToUse);

          // Resolve token symbols to get proper symbols for pool lookup
          const baseTokenInfo = await solana.getToken(baseToken);
          const quoteTokenInfo = await solana.getToken(quoteToken);

          if (!baseTokenInfo || !quoteTokenInfo) {
            throw fastify.httpErrors.badRequest(
              `Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`,
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import(
            '../../../services/pool-service'
          );
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'raydium',
            networkToUse,
            'clmm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Raydium`,
            );
          }

          poolAddressToUse = pool.address;
        }

        return await executeSwap(
          fastify,
          networkToUse,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressToUse,
          slippagePct,
          priorityFeePerCU,
          computeUnits,
        );
      } catch (e) {
        // Preserve the original error if it's a FastifyError
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError(
          'Failed to get swap quote',
        );
      }
    },
  );
};

export default executeSwapRoute;

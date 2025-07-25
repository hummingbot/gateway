import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana, BASE_FEE } from '../../../chains/solana/solana';
import { SolanaLedger } from '../../../chains/solana/solana-ledger';
import { ExecuteSwapResponse, ExecuteSwapResponseType, ExecuteSwapRequestType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumAmmExecuteSwapRequest } from '../schemas';

import { getRawSwapQuote } from './quoteSwap';

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

  // Check if this is a hardware wallet
  const isHardwareWallet = await solana.isHardwareWallet(walletAddress);

  // For hardware wallets, we need the public key but will sign differently
  // For regular wallets, we get the keypair
  const wallet = isHardwareWallet ? await solana.getPublicKey(walletAddress) : await solana.getWallet(walletAddress);

  // Set the owner for SDK operations
  await raydium.setOwner(wallet);

  // Get pool info from address
  const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  // Use configured slippage if not provided
  const effectiveSlippage = slippagePct || RaydiumConfig.config.slippagePct;

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

  // Use provided compute units or default
  const COMPUTE_UNITS = computeUnits || 300000;

  // Use provided priority fee per CU or estimate default
  let finalPriorityFeePerCU: number;
  if (priorityFeePerCU !== undefined) {
    finalPriorityFeePerCU = priorityFeePerCU;
  } else {
    // Calculate default if not provided
    const currentPriorityFee = (await solana.estimateGas()) * 1e9 - BASE_FEE;
    finalPriorityFeePerCU = Math.floor((currentPriorityFee * 1e6) / COMPUTE_UNITS);
  }
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
          microLamports: finalPriorityFeePerCU,
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
          microLamports: finalPriorityFeePerCU,
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
          microLamports: finalPriorityFeePerCU,
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
          microLamports: finalPriorityFeePerCU,
        },
      })) as { transaction: VersionedTransaction });
    }
  } else {
    throw new Error(`Unsupported pool type: ${poolInfo.poolType}`);
  }

  // Sign transaction - different approach for hardware vs regular wallets
  if (isHardwareWallet) {
    logger.info(`Hardware wallet detected for ${walletAddress}. Signing transaction with Ledger.`);
    const ledger = new SolanaLedger();
    transaction = (await ledger.signTransaction(walletAddress, transaction)) as VersionedTransaction;
  } else {
    // Regular wallet - sign normally
    transaction.sign([wallet as any]);
  }

  await solana.simulateTransaction(transaction as VersionedTransaction);

  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);

  // Return with status
  if (confirmed && txData) {
    // Transaction confirmed, return full data
    const baseTokenInfo = await solana.getToken(poolInfo.baseTokenAddress);
    const quoteTokenInfo = await solana.getToken(poolInfo.quoteTokenAddress);

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, [
      baseTokenInfo.address,
      quoteTokenInfo.address,
    ]);

    const baseTokenBalanceChange = balanceChanges[0];
    const quoteTokenBalanceChange = balanceChanges[1];

    logger.info(
      `Swap executed successfully: ${Math.abs(side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`,
    );

    // Calculate actual amounts swapped based on side
    const amountIn = Math.abs(side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange);
    const amountOut = Math.abs(side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange);

    // Determine token addresses for computed fields
    const tokenIn = inputToken.address;
    const tokenOut = outputToken.address;

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: txData.meta.fee / 1e9,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
      },
    };
  } else {
    // Transaction pending, return for Hummingbot to handle retry
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Raydium AMM or CPMM',
        tags: ['/connector/raydium'],
        body: {
          ...RaydiumAmmExecuteSwapRequest,
          properties: {
            ...RaydiumAmmExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
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
        } = request.body as typeof RaydiumAmmExecuteSwapRequest._type;
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
              sanitizeErrorMessage('Token not found: {}', !baseTokenInfo ? baseToken : quoteToken),
            );
          }

          // Use PoolService to find pool by token pair
          const { PoolService } = await import('../../../services/pool-service');
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'raydium',
            networkToUse,
            'amm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Raydium`,
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
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Swap execution failed');
      }
    },
  );
};

export default executeSwapRoute;

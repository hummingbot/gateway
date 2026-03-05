import { VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { PoolService } from '#src/services/pool-service';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponse, ExecuteSwapResponseType, ExecuteSwapRequestType } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pumpswap } from '../pumpswap';
import { PumpswapConfig } from '../pumpswap.config';
import { buildSwapTransaction } from '../pumpswap.transactions';
import { PumpswapAmmExecuteSwapRequest } from '../schemas';

import { quoteSwap } from './quoteSwap';

export async function executeSwap(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct: number = PumpswapConfig.config.slippagePct,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const pumpswap = await Pumpswap.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet, isHardwareWallet } = await pumpswap.prepareWallet(walletAddress);

  // Get pool info from address
  const poolInfo = await pumpswap.getAmmPoolInfo(poolAddress);
  if (!poolInfo) {
    throw httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  // Get quote to determine amounts
  const quote = await quoteSwap(network, poolAddress, baseToken, quoteToken, amount, side, slippagePct);

  // Resolve tokens
  const resolvedBaseToken = await solana.getToken(baseToken);
  const resolvedQuoteToken = await solana.getToken(quoteToken);

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    throw httpErrors.notFound(`Token not found: ${!resolvedBaseToken ? baseToken : quoteToken}`);
  }

  // Determine input/output tokens and amounts
  const isBaseInput = side === 'SELL';
  const inputToken = isBaseInput ? resolvedBaseToken : resolvedQuoteToken;
  const outputToken = isBaseInput ? resolvedQuoteToken : resolvedBaseToken;

  // Convert amounts to BN with proper decimals
  const inputAmount = new BN(new Decimal(quote.amountIn).mul(10 ** inputToken.decimals).toFixed(0));
  const minOutputAmount = new BN(new Decimal(quote.minAmountOut).mul(10 ** outputToken.decimals).toFixed(0));

  // Get wallet public key
  const walletPubkey = isHardwareWallet ? (wallet as any) : (wallet as any).publicKey;

  // Get priority fee
  const priorityFeeInLamports = await solana.estimateGasPrice();
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  // Build transaction
  const transaction = await buildSwapTransaction(
    solana,
    poolAddress,
    walletPubkey,
    new (await import('@solana/web3.js')).PublicKey(inputToken.address),
    new (await import('@solana/web3.js')).PublicKey(outputToken.address),
    inputAmount,
    minOutputAmount,
    isBaseInput,
    300000, // compute units
    priorityFeePerCU,
  );

  // Sign transaction
  const signedTransaction = (await pumpswap.signTransaction(
    transaction,
    walletAddress,
    isHardwareWallet,
    wallet,
  )) as VersionedTransaction;

  // Simulate transaction
  await solana.simulateWithErrorHandling(signedTransaction);

  // Send and confirm
  const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(signedTransaction);

  // Handle confirmation
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
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Pumpswap AMM',
        tags: ['/connector/pumpswap'],
        body: {
          ...PumpswapAmmExecuteSwapRequest,
          properties: {
            ...PumpswapAmmExecuteSwapRequest.properties,
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
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } =
          request.body as typeof PumpswapAmmExecuteSwapRequest._type;
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
          const poolService = PoolService.getInstance();

          const pool = await poolService.getPool(
            'pumpswap',
            networkToUse,
            'amm',
            baseTokenInfo.symbol,
            quoteTokenInfo.symbol,
          );

          if (!pool) {
            throw httpErrors.notFound(
              `No AMM pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Pumpswap`,
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
        logger.error(e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Swap execution failed');
      }
    },
  );
};

export default executeSwapRoute;

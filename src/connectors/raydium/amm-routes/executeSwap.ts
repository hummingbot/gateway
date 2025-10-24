import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ExecuteSwapResponse, ExecuteSwapResponseType, ExecuteSwapRequestType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';
import { RaydiumAmmExecuteSwapRequest } from '../schemas';
import { ExecuteSwapOperation } from '../../../../packages/sdk/src/solana/raydium/operations/amm/execute-swap';

async function executeSwap(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Create SDK operation
  const operation = new ExecuteSwapOperation(raydium, solana);

  // Use configured slippage if not provided
  const effectiveSlippage = slippagePct || RaydiumConfig.config.slippagePct;

  // Determine tokenIn/tokenOut and amount based on side
  const [tokenIn, tokenOut, amountIn, amountOut] =
    side === 'SELL'
      ? [baseToken, quoteToken, amount, undefined]
      : [quoteToken, baseToken, undefined, amount];

  // Execute using SDK
  const result = await operation.execute({
    network,
    poolAddress,
    walletAddress,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    slippagePct: effectiveSlippage,
  });

  if (result.status === 1 && result.data) {
    const inputToken = await solana.getToken(tokenIn);
    const outputToken = await solana.getToken(tokenOut);
    logger.info(
      `Swap executed successfully: ${result.data.amountIn.toFixed(4)} ${inputToken.symbol} -> ${result.data.amountOut.toFixed(4)} ${outputToken.symbol}`,
    );
  }

  return result;
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
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } =
          request.body as typeof RaydiumAmmExecuteSwapRequest._type;
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
        throw fastify.httpErrors.internalServerError('Swap execution failed');
      }
    },
  );
};

export default executeSwapRoute;

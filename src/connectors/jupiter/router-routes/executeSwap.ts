import { Wallet } from '@coral-xyz/anchor';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ExecuteSwapRequestType,
  SwapExecuteResponseType,
  SwapExecuteResponse,
} from '../../../schemas/router-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Jupiter } from '../jupiter';
import { JupiterExecuteSwapRequest } from '../schemas';

async function executeSwap(
  fastify: FastifyInstance,
  walletAddress: string,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct: number,
  onlyDirectRoutes?: boolean,
  asLegacyTransaction?: boolean,
  _maxAccounts?: number,
  priorityFeeLamports?: number,
  computeUnits?: number,
): Promise<SwapExecuteResponseType> {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);
  const keypair = await solana.getWallet(walletAddress);
  const wallet = new Wallet(keypair as any);

  // Resolve token symbols to addresses
  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.badRequest(
      sanitizeErrorMessage(
        'Token not found: {}',
        !baseTokenInfo ? baseToken : quoteToken,
      ),
    );
  }

  // Determine input/output based on side
  const inputToken = side === 'SELL' ? baseTokenInfo : quoteTokenInfo;
  const outputToken = side === 'SELL' ? quoteTokenInfo : baseTokenInfo;
  const inputAmount =
    side === 'SELL'
      ? amount * Math.pow(10, baseTokenInfo.decimals)
      : amount * Math.pow(10, quoteTokenInfo.decimals);

  logger.info(
    `Executing swap for ${amount} ${inputToken.symbol} -> ${outputToken.symbol}`,
  );

  // Get quote from Jupiter API
  const quoteResponse = await jupiter.getQuote(
    inputToken.address,
    outputToken.address,
    inputAmount / Math.pow(10, inputToken.decimals),
    slippagePct,
    onlyDirectRoutes || false,
    asLegacyTransaction || false,
    side === 'BUY' ? 'ExactOut' : 'ExactIn',
  );

  if (!quoteResponse) {
    throw fastify.httpErrors.notFound('No routes found for this swap');
  }

  const bestRoute = quoteResponse;

  // Execute the swap
  const swapResult = await jupiter.executeSwap(
    wallet,
    bestRoute,
    priorityFeeLamports
      ? priorityFeeLamports / (computeUnits || 300000)
      : undefined,
    computeUnits,
  );

  if (!swapResult.confirmed) {
    throw fastify.httpErrors.internalServerError('Transaction not confirmed');
  }

  const signature = swapResult.signature;
  const fee = swapResult.feeInLamports / 1e9;

  // Extract balance changes
  const { baseTokenBalanceChange, quoteTokenBalanceChange } =
    await solana.extractPairBalanceChangesAndFee(
      signature,
      baseTokenInfo,
      quoteTokenInfo,
      walletAddress,
    );

  // Calculate actual amounts swapped
  const totalInputSwapped =
    side === 'SELL'
      ? Math.abs(baseTokenBalanceChange)
      : Math.abs(quoteTokenBalanceChange);
  const totalOutputSwapped =
    side === 'SELL'
      ? Math.abs(quoteTokenBalanceChange)
      : Math.abs(baseTokenBalanceChange);

  logger.info(
    `Swap executed successfully: ${totalInputSwapped.toFixed(4)} ${inputToken.symbol} -> ${totalOutputSwapped.toFixed(4)} ${outputToken.symbol}`,
  );

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      totalInputSwapped,
      totalOutputSwapped,
      fee,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      tokenInAmount: totalInputSwapped,
      tokenOutAmount: totalOutputSwapped,
    },
  };
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: SwapExecuteResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Quote and execute a token swap on Jupiter in one step',
        tags: ['jupiter/swap'],
        body: {
          ...JupiterExecuteSwapRequest,
          properties: {
            ...JupiterExecuteSwapRequest.properties,
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: { 200: SwapExecuteResponse },
      },
    },
    async (request) => {
      try {
        const {
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          onlyDirectRoutes,
          asLegacyTransaction,
          maxAccounts,
          priorityFeeLamports,
          computeUnits,
        } = request.body as typeof JupiterExecuteSwapRequest._type;

        return await executeSwap(
          fastify,
          walletAddress,
          network,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          onlyDirectRoutes,
          asLegacyTransaction,
          maxAccounts,
          priorityFeeLamports,
          computeUnits,
        );
      } catch (e) {
        if (e.statusCode) throw e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

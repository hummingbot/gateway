import { SwapQuoteExactOut, SwapQuote } from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ExecuteSwapResponseType,
  ExecuteSwapResponse,
  ExecuteSwapRequest,
  ExecuteSwapRequestType,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';

import { getRawSwapQuote } from './quoteSwap';

async function executeSwap(
  fastify: FastifyInstance,
  network: string,
  address: string,
  baseTokenIdentifier: string,
  quoteTokenIdentifier: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  const {
    inputToken,
    outputToken,
    swapAmount,
    quote: swapQuote,
    dlmmPool,
  } = await getRawSwapQuote(
    fastify,
    network,
    baseTokenIdentifier,
    quoteTokenIdentifier,
    amount,
    side,
    poolAddress,
    slippagePct || meteora.getSlippagePct(),
  );

  logger.info(
    `Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`,
  );

  const swapTx =
    side === 'BUY'
      ? await dlmmPool.swapExactOut({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          outAmount: (swapQuote as SwapQuoteExactOut).outAmount,
          maxInAmount: (swapQuote as SwapQuoteExactOut).maxInAmount,
          lbPair: dlmmPool.pubkey,
          user: wallet.publicKey,
          binArraysPubkey: (swapQuote as SwapQuoteExactOut).binArraysPubkey,
        })
      : await dlmmPool.swap({
          inToken: new PublicKey(inputToken.address),
          outToken: new PublicKey(outputToken.address),
          inAmount: swapAmount,
          minOutAmount: (swapQuote as SwapQuote).minOutAmount,
          lbPair: dlmmPool.pubkey,
          user: wallet.publicKey,
          binArraysPubkey: (swapQuote as SwapQuote).binArraysPubkey,
        });

  const { signature, fee } = await solana.sendAndConfirmTransaction(
    swapTx,
    [wallet],
    150_000,
  );

  const { baseTokenBalanceChange, quoteTokenBalanceChange } =
    await solana.extractPairBalanceChangesAndFee(
      signature,
      await solana.getToken(dlmmPool.tokenX.publicKey.toBase58()),
      await solana.getToken(dlmmPool.tokenY.publicKey.toBase58()),
      wallet.publicKey.toBase58(),
    );

  logger.info(
    `Swap executed successfully: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`,
  );

  return {
    signature,
    totalInputSwapped: Math.abs(baseTokenBalanceChange),
    totalOutputSwapped: Math.abs(quoteTokenBalanceChange),
    fee,
    baseTokenBalanceChange,
    quoteTokenBalanceChange,
  };
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
        description: 'Execute a token swap on Meteora',
        tags: ['meteora/clmm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
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
        } = request.body;
        const networkUsed = network || 'mainnet-beta';
        const meteora = await Meteora.getInstance(networkUsed);
        const poolAddressUsed =
          poolAddress || (await meteora.findDefaultPool(baseToken, quoteToken));

        if (!poolAddressUsed) {
          throw fastify.httpErrors.notFound(
            `No pool found for ${baseToken}-${quoteToken} pair`,
          );
        }
        logger.info(
          `Received swap request: ${amount} ${baseToken} -> ${quoteToken} in pool ${poolAddress}`,
        );

        return await executeSwap(
          fastify,
          networkUsed,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressUsed,
          slippagePct,
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error('Error executing swap:', e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default executeSwapRoute;

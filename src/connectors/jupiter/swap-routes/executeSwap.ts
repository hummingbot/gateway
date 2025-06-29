import { Wallet } from '@coral-xyz/anchor';
import Decimal from 'decimal.js-light';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  ExecuteSwapRequest,
  ExecuteSwapResponse,
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
} from '../../../schemas/swap-schema';
import { logger } from '../../../services/logger';
import { Jupiter } from '../jupiter';

async function executeJupiterSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  priorityFeePerCU?: number,
  computeUnits?: number,
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);
  const keypair = await solana.getWallet(walletAddress);
  const wallet = new Wallet(keypair as any);

  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw fastify.httpErrors.notFound(
      `Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`,
    );
  }

  const tradeSide = side === 'BUY' ? 'BUY' : 'SELL';
  const amountValue = side === 'SELL' ? amount : amount;

  try {
    const quote = await jupiter.getQuote(
      tradeSide === 'BUY' ? quoteTokenInfo.address : baseTokenInfo.address,
      tradeSide === 'BUY' ? baseTokenInfo.address : quoteTokenInfo.address,
      amountValue,
      slippagePct || jupiter.getSlippagePct(),
      false,
      false,
      tradeSide === 'BUY' ? 'ExactOut' : 'ExactIn',
    );

    const swapResult = await jupiter.executeSwap(
      wallet,
      quote,
      priorityFeePerCU,
      computeUnits,
    );

    // Return with status
    if (swapResult.confirmed && swapResult.txData) {
      // Transaction confirmed, extract balance changes
      const { baseTokenBalanceChange, quoteTokenBalanceChange } =
        await solana.extractPairBalanceChangesAndFee(
          swapResult.signature,
          baseTokenInfo,
          quoteTokenInfo,
          wallet.publicKey.toBase58(),
        );

      return {
        signature: swapResult.signature,
        status: 1, // CONFIRMED
        data: {
          totalInputSwapped: Math.abs(
            side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange,
          ),
          totalOutputSwapped: Math.abs(
            side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange,
          ),
          fee: swapResult.feeInLamports / 1e9,
          baseTokenBalanceChange: baseTokenBalanceChange,
          quoteTokenBalanceChange: quoteTokenBalanceChange,
        },
      };
    } else {
      // Transaction pending, return for Hummingbot to handle retry
      return {
        signature: swapResult.signature,
        status: 0, // PENDING
      };
    }
  } catch (error: any) {
    logger.error(`Jupiter swap error: ${error.message || error}`);

    // Check for specific error types
    if (error.message?.includes('ExactOut not supported')) {
      throw fastify.httpErrors.badRequest(error.message);
    }
    if (error.message?.includes('No route found')) {
      throw fastify.httpErrors.notFound(error.message);
    }
    if (error.message?.includes('Token not found')) {
      throw fastify.httpErrors.badRequest(error.message);
    }

    throw fastify.httpErrors.internalServerError(
      `Failed to execute Jupiter swap: ${error.message || 'Unknown error'}`,
    );
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';

  try {
    firstWalletAddress =
      (await solana.getFirstWalletAddress()) || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  // Update schema example
  ExecuteSwapRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute Jupiter swap',
        tags: ['jupiter'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            slippagePct: { type: 'number', examples: [1] },
            poolAddress: { type: 'string', examples: [''] },
          },
        },
        response: { 200: ExecuteSwapResponse },
      },
    },
    async (request) => {
      const {
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        priorityFeePerCU,
        computeUnits,
      } = request.body;

      // Verify we have the needed parameters
      if (!baseToken || !quoteToken) {
        throw fastify.httpErrors.badRequest(
          'baseToken and quoteToken are required',
        );
      }

      // Log the operation
      logger.debug(
        `Executing Jupiter swap for ${baseToken}-${quoteToken} with default routing`,
      );

      return await executeJupiterSwap(
        fastify,
        network || 'mainnet-beta',
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side as 'BUY' | 'SELL',
        slippagePct,
        priorityFeePerCU,
        computeUnits,
      );
    },
  );
};

export default executeSwapRoute;

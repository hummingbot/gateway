import { FastifyPluginAsync } from 'fastify';
import { Solana } from '../../../chains/solana/solana';
import { Jupiter } from '../jupiter';
import { logger } from '../../../services/logger';
import { ExecuteSwapRequestType, ExecuteSwapResponseType } from '../../../schemas/routes/swap-schema';
import { HttpException } from '../../../services/error-handler';
import { wrapResponse } from '../../../services/response-wrapper';
import { Wallet } from '@coral-xyz/anchor';
import Decimal from 'decimal.js-light';

async function executeJupiterSwap(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'buy' | 'sell',
  slippagePct?: number
) {
  const solana = await Solana.getInstance(network);
  const jupiter = await Jupiter.getInstance(network);
  const keypair = await solana.getWallet(walletAddress);
  const wallet = new Wallet(keypair as any);

  const baseTokenInfo = await solana.getToken(baseToken);
  const quoteTokenInfo = await solana.getToken(quoteToken);

  if (!baseTokenInfo || !quoteTokenInfo) {
    throw new Error(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
  }

  const tradeSide = side === 'buy' ? 'BUY' : 'SELL';
  const amountValue = side === 'buy' ? amount : amount;

  try {
    const quote = await jupiter.getQuote(
      baseTokenInfo.address,
      quoteTokenInfo.address,
      amountValue,
      slippagePct,
      false, // onlyDirectRoutes
      false, // asLegacyTransaction
      tradeSide === 'BUY' ? 'ExactOut' : 'ExactIn'
    );

    const { signature, feeInLamports } = await jupiter.executeSwap(
      wallet,
      quote
    );

    return {
      signature,
      baseToken: baseTokenInfo,
      quoteToken: quoteTokenInfo,
      expectedAmount: quote.outAmount,
      inputAmount: amountValue,
      gasCost: feeInLamports / 1e9 // Convert lamports to SOL
    };
  } catch (error) {
    logger.error(`Jupiter swap error: ${error}`);
    throw new HttpException(500, 'Failed to execute Jupiter swap');
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
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
          type: 'object',
          required: ['walletAddress', 'baseToken', 'quoteToken', 'amount', 'side'],
          properties: {
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string' },
            baseToken: { type: 'string' },
            quoteToken: { type: 'string' },
            amount: { type: 'number' },
            side: { type: 'string', enum: ['buy', 'sell'] },
            slippagePct: { type: 'number' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              signature: { type: 'string' },
              totalInputSwapped: { type: 'number' },
              totalOutputSwapped: { type: 'number' },
              fee: { type: 'number' },
              baseTokenBalanceChange: { type: 'number' },
              quoteTokenBalanceChange: { type: 'number' }
            }
          }
        }
      }
    },
    async (request) => {
      const { network, walletAddress, baseToken, quoteToken, amount, side, slippagePct } = request.body;
      const result = await executeJupiterSwap(
        network || 'mainnet-beta',
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side as 'buy' | 'sell',
        slippagePct
      );

      const inputAmount = new Decimal(result.inputAmount)
        .div(10 ** result.baseToken.decimals)
        .toNumber();
      const outputAmount = new Decimal(result.expectedAmount)
        .div(10 ** result.quoteToken.decimals)
        .toNumber();

      return wrapResponse({
        signature: result.signature,
        totalInputSwapped: side === 'sell' ? inputAmount : outputAmount,
        totalOutputSwapped: side === 'sell' ? outputAmount : inputAmount,
        fee: Number(result.gasCost),
        baseTokenBalanceChange: side === 'sell' ? -inputAmount : outputAmount,
        quoteTokenBalanceChange: side === 'sell' ? outputAmount : -inputAmount
      }, Date.now());
    }
  );
};

export default executeSwapRoute; 
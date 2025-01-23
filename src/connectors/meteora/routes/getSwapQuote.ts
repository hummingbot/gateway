import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { DecimalUtil } from '@orca-so/common-sdk';
import { MeteoraController } from '../meteora.controller';
import { SolanaController } from '../../solana/solana.controller';
import BN from 'bn.js';
import Decimal from 'decimal.js';

class GetSwapQuoteController extends MeteoraController {
  async getSwapQuote(
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    poolAddress: string,
    slippagePct?: number,
  ): Promise<{
    estimatedAmountIn: string;
    estimatedAmountOut: string;
    minOutAmount: string;
  }> {
    const solanaController = new SolanaController();
    const inputToken = await solanaController.getTokenBySymbol(inputTokenSymbol);
    const outputToken = await solanaController.getTokenBySymbol(outputTokenSymbol);

    if (!inputToken || !outputToken) {
      throw new Error('Invalid token symbols');
    }

    const dlmmPool = await this.getDlmmPool(poolAddress);
    await dlmmPool.refetchStates(); // Add this line to ensure we have the latest pool state

    const swapAmount = new BN(DecimalUtil.toBN(new Decimal(amount), inputToken.decimals));
    const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();

    const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);

    const slippage = new BN((slippagePct || 1) * 100); // Default 1% slippage

    const swapQuote = dlmmPool.swapQuote(swapAmount, swapForY, slippage, binArrays);

    return {
      estimatedAmountIn: DecimalUtil.fromBN(
        swapQuote.consumedInAmount,
        inputToken.decimals,
      ).toString(),
      estimatedAmountOut: DecimalUtil.fromBN(swapQuote.outAmount, outputToken.decimals).toString(),
      minOutAmount: DecimalUtil.fromBN(swapQuote.minOutAmount, outputToken.decimals).toString(),
    };
  }
}

export default function getSwapQuoteRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new GetSwapQuoteController();

  fastify.get(`/${folderName}/quote-swap`, {
    schema: {
      tags: [folderName],
      description: 'Get a swap quote for Meteora',
      querystring: Type.Object({
        inputTokenSymbol: Type.String(),
        outputTokenSymbol: Type.String(),
        amount: Type.Number(),
        poolAddress: Type.String(),
        slippagePct: Type.Optional(Type.Number({ default: 1, minimum: 0, maximum: 100 })),
      }),
      response: {
        200: Type.Object({
          estimatedAmountIn: Type.String(),
          estimatedAmountOut: Type.String(),
          minOutAmount: Type.String(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { inputTokenSymbol, outputTokenSymbol, amount, poolAddress, slippagePct } =
        request.query as {
          inputTokenSymbol: string;
          outputTokenSymbol: string;
          amount: number;
          poolAddress: string;
          slippagePct?: number;
        };
      fastify.log.info(
        `Getting Meteora swap quote for ${inputTokenSymbol} to ${outputTokenSymbol}`,
      );
      try {
        const quote = await controller.getSwapQuote(
          inputTokenSymbol,
          outputTokenSymbol,
          amount,
          poolAddress,
          slippagePct,
        );
        return quote;
      } catch (error) {
        fastify.log.error(`Error getting swap quote: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        reply.status(500).send({ error: `Failed to get swap quote: ${error.message}` });
      }
    },
  });
}

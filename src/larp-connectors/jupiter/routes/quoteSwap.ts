import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { QuoteGetRequest, QuoteResponse } from '@jup-ag/api';
import { JupiterController } from '../jupiter.controller';
import { SolanaController } from '../../solana/solana.controller';

export class GetSwapQuoteController extends JupiterController {
  constructor() {
    super();
  }

  async getQuote(
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    slippagePct?: number,
    onlyDirectRoutes: boolean = false,
    asLegacyTransaction: boolean = false,
  ): Promise<QuoteResponse> {
    await this.loadJupiter();

    const solanaController = new SolanaController();
    const inputToken = await solanaController.getTokenBySymbol(inputTokenSymbol);
    const outputToken = await solanaController.getTokenBySymbol(outputTokenSymbol);

    if (!inputToken || !outputToken) {
      console.error('Invalid token symbols');
      throw new Error('Invalid token symbols');
    }

    const slippageBps = slippagePct ? Math.round(slippagePct * 100) : 50;
    const quoteAmount = Math.floor(amount * 10 ** inputToken.decimals);

    const params: QuoteGetRequest = {
      inputMint: inputToken.address,
      outputMint: outputToken.address,
      amount: quoteAmount,
      slippageBps,
      onlyDirectRoutes,
      asLegacyTransaction,
      swapMode: 'ExactIn',
    };

    const quote = await this.jupiterQuoteApi.quoteGet(params);

    if (!quote) {
      console.error('Unable to get quote');
      throw new Error('Unable to get quote');
    }

    return quote;
  }
}

export default function getSwapQuoteRoute(fastify: FastifyInstance, folderName: string) {
  const controller = new GetSwapQuoteController();

  fastify.get(`/${folderName}/quote-swap`, {
    schema: {
      tags: [folderName],
      description: 'Get a swap quote for Jupiter',
      querystring: Type.Object({
        inputTokenSymbol: Type.String(),
        outputTokenSymbol: Type.String(),
        amount: Type.Number(),
        slippagePct: Type.Optional(Type.Number({ default: 1, minimum: 0, maximum: 100 })),
        onlyDirectRoutes: Type.Optional(Type.Boolean({ default: false })),
        asLegacyTransaction: Type.Optional(Type.Boolean({ default: false })),
      }),
      response: {
        200: Type.Object({
          inAmount: Type.String(),
          outAmount: Type.String(),
          otherAmountThreshold: Type.String(),
          swapMode: Type.String(),
          priceImpactPct: Type.String(),
          routePlan: Type.Array(Type.Object({})),
          contextSlot: Type.Number(),
          timeTaken: Type.Number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const {
        inputTokenSymbol,
        outputTokenSymbol,
        amount,
        slippagePct,
        onlyDirectRoutes,
        asLegacyTransaction,
      } = request.query as {
        inputTokenSymbol: string;
        outputTokenSymbol: string;
        amount: number;
        slippagePct?: number;
        onlyDirectRoutes?: boolean;
        asLegacyTransaction?: boolean;
      };
      fastify.log.info(
        `Getting Jupiter swap quote for ${inputTokenSymbol} to ${outputTokenSymbol}`,
      );
      const quote = await controller.getQuote(
        inputTokenSymbol,
        outputTokenSymbol,
        amount,
        slippagePct,
        onlyDirectRoutes,
        asLegacyTransaction,
      );
      return quote;
    },
  });
}

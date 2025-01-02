import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import DLMM, { LbPosition, PositionInfo } from '@meteora-ag/dlmm';
import { MeteoraController } from '../meteora.controller';
import { BN } from 'bn.js';

export const QuoteFeesResponse = Type.Object({
  tokenX: Type.Object({
    address: Type.String(),
    amount: Type.String(),
  }),
  tokenY: Type.Object({
    address: Type.String(),
    amount: Type.String(),
  }),
});

class GetFeesQuoteController extends MeteoraController {
  private feesQuoteValidator = TypeCompiler.Compile(QuoteFeesResponse);

  async getFeesQuote(positionAddress: string): Promise<string> {
    // Find all positions by users
    const allPositions = await DLMM.getAllLbPairPositionsByUser(
      this.connectionPool.getNextConnection(),
      this.keypair.publicKey,
    );

    // Find the matching position info
    let matchingLbPosition: LbPosition | undefined;
    let matchingPositionInfo: PositionInfo | undefined;

    for (const position of allPositions.values()) {
      matchingLbPosition = position.lbPairPositionsData.find(
        (lbPosition) => lbPosition.publicKey.toBase58() === positionAddress,
      );
      if (matchingLbPosition) {
        matchingPositionInfo = position;
        break;
      }
    }

    if (!matchingLbPosition || !matchingPositionInfo) {
      throw new Error('Position not found');
    }

    // Initialize DLMM pool
    const dlmmPool = await this.getDlmmPool(matchingPositionInfo.publicKey.toBase58());

    // Update pool state
    await dlmmPool.refetchStates();

    // Get fees quote
    const positionsState = await dlmmPool.getPositionsByUserAndLbPair(this.keypair.publicKey);

    // Find the updated position in positionsState
    const updatedPosition = positionsState.userPositions.find((position) =>
      position.publicKey.equals(matchingLbPosition.publicKey),
    );

    if (!updatedPosition) {
      throw new Error('Updated position not found');
    }

    const tokenXClaimableFees = updatedPosition.positionData.feeX;
    const tokenYClaimableFees = updatedPosition.positionData.feeY;

    const tokenX = matchingPositionInfo.tokenX;
    const tokenY = matchingPositionInfo.tokenY;

    const feesQuoteResponse = {
      tokenX: {
        address: tokenX.publicKey.toBase58(),
        amount: new BN(tokenXClaimableFees.toString())
          .div(new BN(10).pow(new BN(tokenX.decimal)))
          .toString(),
      },
      tokenY: {
        address: tokenY.publicKey.toBase58(),
        amount: new BN(tokenYClaimableFees.toString())
          .div(new BN(10).pow(new BN(tokenY.decimal)))
          .toString(),
      },
    };

    // Validate the feeQuote object against the schema
    if (!this.feesQuoteValidator.Check(feesQuoteResponse)) {
      throw new Error('Fee quote does not match the expected schema');
    }

    return JSON.stringify(feesQuoteResponse);
  }
}

export default function getFeesQuoteRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new GetFeesQuoteController();

  fastify.get(`/${folderName}/quote-fees/:positionAddress`, {
    schema: {
      tags: [folderName],
      description: 'Get the fees quote for a Meteora position',
      params: Type.Object({
        positionAddress: Type.String(),
      }),
      response: {
        200: QuoteFeesResponse,
      },
    },
    handler: async (request, reply) => {
      const { positionAddress } = request.params as { positionAddress: string };
      try {
        fastify.log.info(`Getting fees quote for Meteora position: ${positionAddress}`);
        const result = await controller.getFeesQuote(positionAddress);
        return JSON.parse(result);
      } catch (error) {
        fastify.log.error(`Error getting fees quote: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        reply.status(500).send({ error: `Failed to get fees quote: ${error.message}` });
      }
    },
  });
}

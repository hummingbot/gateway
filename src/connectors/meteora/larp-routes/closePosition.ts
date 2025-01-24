import { MeteoraController } from '../meteora.controller';
import DLMM, { LbPosition, PositionInfo } from '@meteora-ag/dlmm';
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

class ClosePositionController extends MeteoraController {
  async closePosition(positionAddress: string): Promise<{
    signature: string;
    returnedSOL: number;
    fee: number;
  }> {
    // Find all positions by users
    const allPositions = await DLMM.getAllLbPairPositionsByUser(
      this.connectionPool.getNextConnection(),
      this.keypair.publicKey,
    );

    // Find the matching position info
    let matchingLbPosition: LbPosition;
    let matchingPositionInfo: PositionInfo;

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
      console.error('Position not found for address:', positionAddress);
      throw new Error('Position not found');
    }

    // Initialize DLMM pool
    const dlmmPool = await this.getDlmmPool(matchingPositionInfo.publicKey.toBase58());

    // Update pool state
    await dlmmPool.refetchStates();

    // Close Position
    const closePositionTx = await dlmmPool.closePosition({
      owner: this.keypair.publicKey,
      position: matchingLbPosition,
    });

    const signature = await this.sendAndConfirmTransaction(closePositionTx, [this.keypair]);

    const { balanceChange, fee } = await this.extractAccountBalanceChangeAndFee(signature, 0);
    const returnedSOL = Math.abs(balanceChange);

    return {
      signature,
      returnedSOL,
      fee,
    };
  }
}

export default function closePositionRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new ClosePositionController();

  fastify.post(`/${folderName}/close-position`, {
    schema: {
      tags: [folderName],
      description: 'Close a Meteora position',
      body: Type.Object({
        positionAddress: Type.String({ default: '' }),
      }),
      response: {
        200: Type.Object({
          signature: Type.String(),
          returnedSOL: Type.Number(),
          fee: Type.Number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { positionAddress } = request.body as {
        positionAddress: string;
      };
      try {
        fastify.log.info(`Closing Meteora position: ${positionAddress}`);
        const result = await controller.closePosition(positionAddress);
        return result;
      } catch (error) {
        fastify.log.error(`Error closing position: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        reply.status(500).send({ error: `Failed to close position: ${error.message}` });
      }
    },
  });
}

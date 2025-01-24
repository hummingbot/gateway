import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import DLMM, { LbPosition, PositionInfo } from '@meteora-ag/dlmm';
import { MeteoraController } from '../meteora.controller';

class CollectFeesController extends MeteoraController {
  async collectFees(positionAddress: string): Promise<{
    signature: string;
    collectedFeeX: number;
    collectedFeeY: number;
    fee: number;
  }> {
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

    // Claim swap fees
    const claimSwapFeeTx = await dlmmPool.claimSwapFee({
      owner: this.keypair.publicKey,
      position: matchingLbPosition,
    });

    const signature = await this.sendAndConfirmTransaction(claimSwapFeeTx, [this.keypair]);

    const { balanceChange: collectedFeeX, fee } = await this.extractTokenBalanceChangeAndFee(
      signature,
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.pubkey.toBase58(),
    );

    const { balanceChange: collectedFeeY } = await this.extractTokenBalanceChangeAndFee(
      signature,
      dlmmPool.tokenY.publicKey.toBase58(),
      dlmmPool.pubkey.toBase58(),
    );

    let adjustedCollectedFeeX = Math.abs(collectedFeeX);
    let adjustedCollectedFeeY = Math.abs(collectedFeeY);

    // Deduct the fee from collectedFeeX if tokenX is SOL
    if (dlmmPool.tokenX.publicKey.toBase58() === 'So11111111111111111111111111111111111111112') {
      adjustedCollectedFeeX -= fee;
    }

    // Deduct the fee from collectedFeeY if tokenY is SOL
    if (dlmmPool.tokenY.publicKey.toBase58() === 'So11111111111111111111111111111111111111112') {
      adjustedCollectedFeeY -= fee;
    }

    return {
      signature,
      collectedFeeX: adjustedCollectedFeeX,
      collectedFeeY: adjustedCollectedFeeY,
      fee,
    };
  }
}

export default function collectFeesRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new CollectFeesController();

  fastify.post(`/${folderName}/collect-fees`, {
    schema: {
      tags: [folderName],
      description: 'Collect fees for a Meteora position',
      body: Type.Object({
        positionAddress: Type.String(),
      }),
      response: {
        200: Type.Object({
          signature: Type.String(),
          collectedFeeX: Type.Number(),
          collectedFeeY: Type.Number(),
          fee: Type.Number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { positionAddress } = request.body as {
        positionAddress: string;
      };
      try {
        fastify.log.info(`Collecting fees for Meteora position: ${positionAddress}`);
        const result = await controller.collectFees(positionAddress);
        return result;
      } catch (error) {
        fastify.log.error(`Error collecting fees: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        reply.status(500).send({ error: `Failed to collect fees: ${error.message}` });
      }
    },
  });
}

import { MeteoraController } from '../meteora.controller';
import { Keypair } from '@solana/web3.js';
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

class OpenPositionController extends MeteoraController {
  async openPosition(
    lowerPrice: number,
    upperPrice: number,
    poolAddress: string,
  ): Promise<{ signature: string; positionAddress: string; sentSOL: number; fee: number }> {
    const newImbalancePosition = new Keypair();

    const dlmmPool = await this.getDlmmPool(poolAddress);

    // Update pool state
    await dlmmPool.refetchStates();

    const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
    const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);

    const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true) - 1;
    const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false) + 1;

    // Create Position
    const createPositionTx = await dlmmPool.createEmptyPosition({
      positionPubKey: newImbalancePosition.publicKey,
      user: this.keypair.publicKey,
      maxBinId,
      minBinId,
    });

    const signature = await this.sendAndConfirmTransaction(createPositionTx, [
      this.keypair,
      newImbalancePosition,
    ]);

    const { balanceChange, fee } = await this.extractAccountBalanceChangeAndFee(signature, 0);
    const sentSOL = Math.abs(balanceChange - fee);

    return {
      signature,
      positionAddress: newImbalancePosition.publicKey.toBase58(),
      sentSOL,
      fee,
    };
  }
}

export default function openPositionRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new OpenPositionController();

  fastify.post(`/${folderName}/open-position`, {
    schema: {
      tags: [folderName],
      description: 'Open a new Meteora position',
      body: Type.Object({
        lowerPrice: Type.Number({ default: 120 }),
        upperPrice: Type.Number({ default: 130 }),
        poolAddress: Type.String({ default: '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6' }),
      }),
      response: {
        200: Type.Object({
          signature: Type.String(),
          positionAddress: Type.String(),
          sentSOL: Type.Number(),
          fee: Type.Number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { lowerPrice, upperPrice, poolAddress } = request.body as {
        lowerPrice: number;
        upperPrice: number;
        poolAddress: string;
      };
      try {
        fastify.log.info(`Opening new Meteora position for pool ${poolAddress}`);
        const result = await controller.openPosition(lowerPrice, upperPrice, poolAddress);
        return result;
      } catch (error) {
        fastify.log.error(`Error opening position: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        reply.status(500).send({ error: `Failed to open position: ${error.message}` });
      }
    },
  });
}

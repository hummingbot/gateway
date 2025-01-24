import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { MeteoraController } from '../meteora.controller';
import { BinLiquidity } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';

class GetActiveBinController extends MeteoraController {
  async getActiveBin(poolAddress: string): Promise<{
    binId: number;
    xAmount: number;
    yAmount: number;
    price: string;
    pricePerToken: string;
  }> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    await dlmmPool.refetchStates();
    const activeBin: BinLiquidity = await dlmmPool.getActiveBin();

    return {
      binId: activeBin.binId,
      xAmount: DecimalUtil.fromBN(activeBin.xAmount, dlmmPool.tokenX.decimal).toNumber(),
      yAmount: DecimalUtil.fromBN(activeBin.yAmount, dlmmPool.tokenY.decimal).toNumber(),
      price: activeBin.price,
      pricePerToken: activeBin.pricePerToken,
    };
  }
}

export default function getActiveBinRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new GetActiveBinController();

  fastify.get(`/${folderName}/active-bin`, {
    schema: {
      tags: [folderName],
      description: 'Get active bin for a Meteora pool',
      querystring: Type.Object({
        poolAddress: Type.String(),
      }),
      response: {
        200: Type.Object({
          binId: Type.Number(),
          xAmount: Type.Number(),
          yAmount: Type.Number(),
          price: Type.String(),
          pricePerToken: Type.String(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { poolAddress } = request.query as {
        poolAddress: string;
      };
      fastify.log.info(`Getting Meteora active bin for pool ${poolAddress}`);
      try {
        const quote = await controller.getActiveBin(poolAddress);
        return quote;
      } catch (error) {
        fastify.log.error(`Error getting active bin: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        reply.status(500).send({ error: `Failed to get active bin: ${error.message}` });
      }
    },
  });
}

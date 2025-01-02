import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { BinLiquidity } from '@meteora-ag/dlmm';
import { MeteoraController } from '../meteora.controller';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';

interface PositionsOwnedByResponse {
  activeBin: BinLiquidity;
  userPositions: Array<any>;
}

class PositionsOwnedController extends MeteoraController {
  private convertDecimals(value: any, decimals: number): string {
    return new BN(value).div(new BN(10).pow(new BN(decimals))).toString();
  }

  async getPositions(address?: string, poolAddress?: string): Promise<PositionsOwnedByResponse> {
    if (!poolAddress) {
      throw new Error('Pool address is required');
    }

    const publicKey = address ? new PublicKey(address) : this.keypair.publicKey;

    try {
      const dlmmPool = await this.getDlmmPool(poolAddress);
      await dlmmPool.refetchStates();

      const { activeBin, userPositions } = await dlmmPool.getPositionsByUserAndLbPair(publicKey);

      const adjustedActiveBin = {
        ...activeBin,
        xAmount: this.convertDecimals(activeBin.xAmount, dlmmPool.tokenX.decimal) as any,
        yAmount: this.convertDecimals(activeBin.yAmount, dlmmPool.tokenY.decimal) as any,
      };

      const adjustedUserPositions = userPositions.map((position) => {
        const { positionData } = position;
        const tokenXDecimals = dlmmPool.tokenX.decimal;
        const tokenYDecimals = dlmmPool.tokenY.decimal;

        return {
          ...position,
          positionData: {
            ...positionData,
            positionBinData: positionData.positionBinData.map((binData) => ({
              ...binData,
              binXAmount: this.convertDecimals(binData.binXAmount, tokenXDecimals),
              binYAmount: this.convertDecimals(binData.binYAmount, tokenYDecimals),
              positionXAmount: this.convertDecimals(binData.positionXAmount, tokenXDecimals),
              positionYAmount: this.convertDecimals(binData.positionYAmount, tokenYDecimals),
            })),
            totalXAmount: this.convertDecimals(positionData.totalXAmount, tokenXDecimals),
            totalYAmount: this.convertDecimals(positionData.totalYAmount, tokenYDecimals),
            feeX: this.convertDecimals(positionData.feeX, tokenXDecimals),
            feeY: this.convertDecimals(positionData.feeY, tokenYDecimals),
            rewardOne: this.convertDecimals(positionData.rewardOne, tokenXDecimals),
            rewardTwo: this.convertDecimals(positionData.rewardTwo, tokenYDecimals),
            lastUpdatedAt: new BN(positionData.lastUpdatedAt).toString(),
          },
        };
      });

      return {
        activeBin: adjustedActiveBin,
        userPositions: adjustedUserPositions,
      };
    } catch (error) {
      console.error('Error fetching user positions:', error);
      throw new Error('Failed to fetch user positions');
    }
  }
}

export default function getPositionsOwnedByRoute(
  fastify: FastifyInstance,
  folderName: string,
): void {
  const controller = new PositionsOwnedController();

  fastify.get(`/${folderName}/positions-owned`, {
    schema: {
      tags: [folderName],
      description: "Retrieve a list of Meteora positions owned by the user's wallet",
      querystring: Type.Object({
        poolAddress: Type.String(),
        address: Type.Optional(Type.String()),
      }),
      response: {
        200: Type.Object({
          activeBin: Type.Any(),
          userPositions: Type.Array(Type.Any()),
        }),
      },
    },
    handler: async (request, reply) => {
      const { address, poolAddress } = request.query as { poolAddress: string; address?: string };
      fastify.log.info(`Getting Meteora positions for ${address || 'user wallet'}`);

      try {
        const positions = await controller.getPositions(address, poolAddress);
        return positions;
      } catch (error) {
        fastify.log.error(`Error fetching positions: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        reply.status(500).send({ error: `Failed to fetch positions: ${error.message}` });
      }
    },
  });
}

import { MeteoraController } from '../meteora.controller';
import DLMM from '@meteora-ag/dlmm';
import { LbPairAccount } from '@meteora-ag/dlmm';
import { Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';

export const LbPairAccountResponse = Type.Object({
  // Get all info from LbPairAccount program account
  publicKey: Type.String(),
  account: Type.Object({
    binArrayBitmap: Type.Optional(Type.Array(Type.Number())),
    bumpSeed: Type.Optional(Type.Number()),
    feeOwner: Type.Optional(Type.String()),
    feeVault: Type.Optional(Type.String()),
    fundOwner: Type.Optional(Type.String()),
    fundVault: Type.Optional(Type.String()),
    inactive: Type.Optional(Type.Boolean()),
    lastUpdatedAt: Type.Optional(Type.Number()),
    oracle: Type.Optional(Type.String()),
    parameters: Type.Optional(
      Type.Object({
        baseFactor: Type.Optional(Type.Number()),
        binStep: Type.Optional(Type.Number()),
        filteredNbReference: Type.Optional(Type.Number()),
        maxBinId: Type.Optional(Type.Number()),
        minBinId: Type.Optional(Type.Number()),
        protocolShare: Type.Optional(Type.Number()),
        reductionFactor: Type.Optional(Type.Number()),
        variableFeeControl: Type.Optional(Type.Number()),
      }),
    ),
    reserveX: Type.Optional(Type.String()),
    reserveY: Type.Optional(Type.String()),
    rewardInfos: Type.Optional(
      Type.Array(
        Type.Object({
          lastUpdateTime: Type.Optional(Type.Number()),
          rewardAPerSecond: Type.Optional(Type.String()),
          rewardBPerSecond: Type.Optional(Type.String()),
          rewardMintAddress: Type.Optional(Type.String()),
          rewardVaultAddress: Type.Optional(Type.String()),
        }),
      ),
    ),
    staticParameters: Type.Optional(
      Type.Object({
        activeId: Type.Optional(Type.Number()),
        binStep: Type.Optional(Type.Number()),
        tokenXMint: Type.Optional(Type.String()),
        tokenYMint: Type.Optional(Type.String()),
      }),
    ),
    totalFeeXAmount: Type.Optional(Type.String()),
    totalFeeYAmount: Type.Optional(Type.String()),
    totalXAmount: Type.Optional(Type.String()),
    totalYAmount: Type.Optional(Type.String()),
    vParameters: Type.Optional(
      Type.Object({
        volatilityAccumulator: Type.Optional(Type.Number()),
        volatilityReference: Type.Optional(Type.Number()),
      }),
    ),
  }),
});

class GetLbPairsController extends MeteoraController {
  async getLbPairs(): Promise<LbPairAccount[]> {
    const allPairs = await DLMM.getLbPairs(this.connectionPool.getNextConnection());
    return allPairs;
  }
}

export default function getLbPairsRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new GetLbPairsController();

  fastify.get(`/${folderName}/lb-pairs`, {
    schema: {
      tags: [folderName],
      description: 'Get all Meteora LB pairs',
      response: {
        200: Type.Array(LbPairAccountResponse),
      },
    },
    handler: async (_request, reply) => {
      try {
        // Get all LB pairs from GetLbPairsController
        const lbPairs = await controller.getLbPairs();
        // Map lbPairs to LbPairAccountResponse
        const lbPairsResponse = lbPairs.map((pair: LbPairAccount) => ({
          publicKey: pair.publicKey.toString(),
          account: pair.account,
        }));

        return reply.send(lbPairsResponse);
      } catch (error) {
        console.error('Error fetching LB pairs:', error);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  });
}

import BN from 'bn.js';
import { MeteoraController } from '../meteora.controller';
import DLMM, { LbPosition, PositionInfo } from '@meteora-ag/dlmm';
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

class RemoveLiquidityController extends MeteoraController {
  async removeLiquidity(
    positionAddress: string,
    percentageToRemove: number,
  ): Promise<{
    signature: string;
    tokenXRemovedAmount: number;
    tokenYRemovedAmount: number;
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

    // Calculate the amount of liquidity to remove
    const binIdsToRemove = matchingLbPosition.positionData.positionBinData.map((bin) => bin.binId);
    const bps = new BN(percentageToRemove * 100);

    // Remove Liquidity
    const removeLiquidityTx = await dlmmPool.removeLiquidity({
      position: matchingLbPosition.publicKey,
      user: this.keypair.publicKey,
      binIds: binIdsToRemove,
      bps: bps,
      shouldClaimAndClose: false, // Set to true if you want to claim swap fee and close position
    });

    if (Array.isArray(removeLiquidityTx)) {
      throw new Error(
        'Unexpected array of transactions. Expected a single transaction for removing liquidity.',
      );
    }

    const signature = await this.sendAndConfirmTransaction(removeLiquidityTx, [this.keypair]);

    const { balanceChange: tokenXRemovedAmount, fee } = await this.extractTokenBalanceChangeAndFee(
      signature,
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.pubkey.toBase58(),
    );

    const { balanceChange: tokenYRemovedAmount } = await this.extractTokenBalanceChangeAndFee(
      signature,
      dlmmPool.tokenY.publicKey.toBase58(),
      dlmmPool.pubkey.toBase58(),
    );

    let adjustedTokenXRemovedAmount = Math.abs(tokenXRemovedAmount);
    let adjustedTokenYRemovedAmount = Math.abs(tokenYRemovedAmount);

    // Deduct the fee from tokenXRemovedAmount if tokenX is SOL
    if (dlmmPool.tokenX.publicKey.toBase58() === 'So11111111111111111111111111111111111111112') {
      adjustedTokenXRemovedAmount -= fee;
    }

    // Deduct the fee from tokenYRemovedAmount if tokenY is SOL
    if (dlmmPool.tokenY.publicKey.toBase58() === 'So11111111111111111111111111111111111111112') {
      adjustedTokenYRemovedAmount -= fee;
    }

    return {
      signature,
      tokenXRemovedAmount: adjustedTokenXRemovedAmount,
      tokenYRemovedAmount: adjustedTokenYRemovedAmount,
      fee,
    };
  }
}

export default function removeLiquidityRoute(fastify: FastifyInstance, folderName: string): void {
  const controller = new RemoveLiquidityController();

  fastify.post(`/${folderName}/remove-liquidity`, {
    schema: {
      tags: [folderName],
      description: 'Remove liquidity from a Meteora position',
      body: Type.Object({
        positionAddress: Type.String({ default: '' }),
        percentageToRemove: Type.Number({ minimum: 0, maximum: 100, default: 50 }),
      }),
      response: {
        200: Type.Object({
          signature: Type.String(),
          tokenXRemovedAmount: Type.Number(),
          tokenYRemovedAmount: Type.Number(),
          fee: Type.Number(),
        }),
      },
    },
    handler: async (request, reply) => {
      const { positionAddress, percentageToRemove } = request.body as {
        positionAddress: string;
        percentageToRemove: number;
      };
      fastify.log.info(`Removing liquidity from Meteora position: ${positionAddress}`);
      try {
        const result = await controller.removeLiquidity(positionAddress, percentageToRemove);
        return reply.send(result);
      } catch (error) {
        fastify.log.error(`Error removing liquidity: ${error.message}`);
        if (error.stack) {
          fastify.log.error(`Stack trace: ${error.stack}`);
        }
        return reply.status(500).send({ error: `Failed to remove liquidity: ${error.message}` });
      }
    },
  });
}

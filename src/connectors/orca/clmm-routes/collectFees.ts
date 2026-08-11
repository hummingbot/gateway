import { harvestPositionInstructions } from '@orca-so/whirlpools';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import { Static } from '@sinclair/typebox';
import { address } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { buildOrcaTransaction, createOrcaAuthority } from '../orca.sdk';
import { OrcaClmmCollectFeesRequest } from '../schemas';

export async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const walletPublicKey = new PublicKey(walletAddress);
  const position = await fetchPosition(orca.solanaKitRpc, address(positionAddress));
  const whirlpool = await fetchWhirlpool(orca.solanaKitRpc, position.data.whirlpool);

  // Harvesting is the current SDK's complete collection flow. It updates the
  // position and collects token fees plus every non-zero reward.
  const result = await harvestPositionInstructions(orca.solanaKitRpc, position.data.positionMint, {
    authority: createOrcaAuthority(walletAddress),
    whirlpoolDeployment: orca.deployment,
  });
  const rewardCount = result.rewardsQuote.rewards.filter((reward) => reward.rewardsOwed > 0n).length;
  logger.info(`Built Orca fee harvest with ${rewardCount} reward collection instruction(s)`);

  const transaction = buildOrcaTransaction(result.instructions, walletAddress);
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const tokenAAddress = whirlpool.data.tokenMintA.toString();
  const tokenBAddress = whirlpool.data.tokenMintB.toString();
  const [tokenA, tokenB, balanceResult] = await Promise.all([
    solana.getToken(tokenAAddress),
    solana.getToken(tokenBAddress),
    solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [tokenAAddress, tokenBAddress]),
  ]);
  const { balanceChanges } = balanceResult;

  logger.info(
    `Fees collected: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA?.symbol || 'tokenA'}, ` +
      `${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB?.symbol || 'tokenB'}`,
  );

  return {
    signature,
    status: 1,
    data: {
      fee,
      baseFeeAmountCollected: Math.abs(balanceChanges[0]),
      quoteFeeAmountCollected: Math.abs(balanceChanges[1]),
    },
  };
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees and rewards from an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmCollectFeesRequest,
        response: { 200: CollectFeesResponse },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, network } = request.body;
        return await collectFees(network, walletAddress, positionAddress);
      } catch (error) {
        logger.error(error);
        if (error.statusCode) throw error;
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default collectFeesRoute;

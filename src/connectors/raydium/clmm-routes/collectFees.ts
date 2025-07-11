import { ApiV3PoolInfoConcentratedItem } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  CollectFeesRequest,
  CollectFeesResponse,
  CollectFeesRequestType,
  CollectFeesResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

export async function collectFees(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  const position = await raydium.getClmmPosition(positionAddress);
  if (!position) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const [poolInfo] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());

  const tokenA = await solana.getToken(poolInfo.mintA.address);
  const tokenB = await solana.getToken(poolInfo.mintB.address);
  const tokenASymbol = tokenA?.symbol || 'UNKNOWN';
  const tokenBSymbol = tokenB?.symbol || 'UNKNOWN';

  logger.info(`Collecting fees from CLMM position ${positionAddress}`);

  const { rewardDefaultInfos } = poolInfo;
  const validRewards = rewardDefaultInfos.filter((info) => Number(info.perSecond) > 0 && info.mint?.address);

  if (validRewards.length === 0) {
    logger.warn(`No active rewards found for position ${positionAddress}`);
  }

  const { transaction } = await raydium.raydiumSDK.clmm.collectRewards({
    poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
    ownerInfo: {
      useSOLBalance: true,
    },
    rewardMints: validRewards.map(
      (info) => new PublicKey(info.mint.address), // Use direct address access
    ),
    associatedOnly: true,
  });
  console.log('transaction', transaction);

  const { signature, fee } = await solana.sendAndConfirmTransaction(transaction, [wallet]);

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, wallet.publicKey.toBase58(), [
    poolInfo.mintA.address,
    poolInfo.mintB.address,
  ]);

  const collectedFeeA = balanceChanges[0];
  const collectedFeeB = balanceChanges[1];

  logger.info(
    `Fees collected from position ${positionAddress}: ${Math.abs(collectedFeeA).toFixed(4)} ${tokenASymbol}, ${Math.abs(
      collectedFeeB,
    ).toFixed(4)} ${tokenBSymbol}`,
  );

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      baseFeeAmountCollected: Math.abs(collectedFeeA),
      quoteFeeAmountCollected: Math.abs(collectedFeeB),
    },
  };
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: CollectFeesRequestType;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: {
          ...CollectFeesRequest,
          properties: {
            ...CollectFeesRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
          },
        },
        response: { 200: CollectFeesResponse },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        return await collectFees(fastify, network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message);
        }
        throw fastify.httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;

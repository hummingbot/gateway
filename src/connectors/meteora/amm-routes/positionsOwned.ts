import { Type } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PositionInfo, PositionInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { MeteoraDamm } from '../meteora-damm';
import { MeteoraAmmGetPositionsOwnedRequest, MeteoraAmmGetPositionsOwnedRequestType } from '../schemas';

import { getPositionInfo } from './positionInfo';

/**
 * Lists all of a wallet's DAMM v2 positions, grouped by pool. DAMM v2 positions are NFTs, so a
 * wallet may hold several per pool; each returned entry is one pool's aggregate PositionInfo with a
 * per-position `positions[]` breakdown (pass a breakdown entry's positionAddress to remove/add).
 */
export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
): Promise<PositionInfo[]> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(walletAddress);
  } catch {
    throw fastify.httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  const meteoraDamm = await MeteoraDamm.getInstance(network);
  const positions = await meteoraDamm.cpAmm.getPositionsByUser(owner);

  // Collect the distinct pools the wallet has positions in; build one PositionInfo per pool.
  const poolAddresses = Array.from(new Set(positions.map((p) => p.positionState.pool.toBase58())));
  logger.info(
    `Found ${positions.length} DAMM v2 position(s) across ${poolAddresses.length} pool(s) for wallet ${walletAddress.slice(0, 8)}...`,
  );

  const result: PositionInfo[] = [];
  for (const poolAddress of poolAddresses) {
    result.push(await getPositionInfo(network, poolAddress, walletAddress));
  }
  return result;
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MeteoraAmmGetPositionsOwnedRequestType;
    Reply: PositionInfo[];
  }>(
    '/positions-owned',
    {
      schema: {
        description: "List all of a wallet's DAMM v2 positions across all Meteora AMM pools",
        tags: ['/connector/meteora'],
        querystring: MeteoraAmmGetPositionsOwnedRequest,
        response: {
          200: Type.Array(PositionInfoSchema),
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress } = request.query;
        return await getPositionsOwned(fastify, network, walletAddress);
      } catch (e: any) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to fetch positions');
      }
    },
  );
};

export default positionsOwnedRoute;

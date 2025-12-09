import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfoSchema, PositionInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionsOwnedRequest, RaydiumClmmGetPositionsOwnedRequestType } from '../schemas';

// Using Fastify's native error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
): Promise<PositionInfo[]> {
  const solana = await Solana.getInstance(network);

  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch {
    throw fastify.httpErrors.badRequest(`Invalid wallet address: ${walletAddress}`);
  }

  // Fetch from RPC (positions are cached individually by position address, not by wallet)
  const positions = await fetchPositionsFromRPC(solana, network, walletAddress);

  return positions;
}

/**
 * Fetch positions from RPC
 */
async function fetchPositionsFromRPC(_solana: Solana, network: string, walletAddress: string): Promise<PositionInfo[]> {
  const raydium = await Raydium.getInstance(network);

  // Prepare wallet and check if it's hardware
  const { wallet } = await raydium.prepareWallet(walletAddress);

  // Set the owner for SDK operations
  await raydium.setOwner(wallet);

  logger.info(`Fetching all positions for wallet ${walletAddress}`);

  // Get all positions owned by the wallet
  const allPositions: PositionInfo[] = [];

  // Try both CLMM program IDs (standard and new)
  const programIds = [
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // CLMM program
    'devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH', // Devnet CLMM (if applicable)
  ];

  for (const programId of programIds) {
    try {
      const positions = await raydium.raydiumSDK.clmm.getOwnerPositionInfo({
        programId,
      });
      logger.debug(`Found ${positions.length} positions for program ${programId}`);

      // Convert SDK positions to our format
      for (const pos of positions) {
        try {
          const positionInfo = await raydium.getPositionInfo(pos.nftMint.toString());
          if (positionInfo) {
            allPositions.push(positionInfo);
          }
        } catch (error) {
          logger.debug(`Error fetching position info for ${pos.nftMint.toString()}:`, error);
        }
      }
    } catch (error) {
      logger.debug(`No positions found for program ${programId}:`, error);
    }
  }

  logger.info(`Found ${allPositions.length} Raydium position(s) for wallet ${walletAddress.slice(0, 8)}...`);
  return allPositions;
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  // Remove wallet address example population code

  fastify.get<{
    Querystring: RaydiumClmmGetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve all positions owned by a user's wallet across all Raydium CLMM pools",
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress } = request.query;
        return await getPositionsOwned(fastify, network, walletAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e; // Re-throw HttpErrors with original message
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default positionsOwnedRoute;

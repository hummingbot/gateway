import { Type } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import { GetPositionsOwnedRequestType, PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmGetPositionsOwnedRequest } from '../schemas';

const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress?: string,
): Promise<PositionInfo[]> {
  const orca = await Orca.getInstance(network);

  // Get wallet address - use provided or default
  const walletAddressToUse = walletAddress || getSolanaChainConfig().defaultWallet;

  // Validate wallet address
  try {
    new PublicKey(walletAddressToUse);
  } catch {
    throw fastify.httpErrors.badRequest(`Invalid wallet address: ${walletAddressToUse}`);
  }

  logger.info(`Fetching all Orca positions for wallet ${walletAddressToUse.slice(0, 8)}...`);

  const positions = await orca.getPositionsForWalletAddress(walletAddressToUse);

  logger.info(`Found ${positions.length} Orca position(s) for wallet ${walletAddressToUse.slice(0, 8)}...`);
  return positions;
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: PositionInfo[];
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of positions owned by a user's wallet in a specific Orca pool",
        tags: ['/connector/orca'],
        querystring: OrcaClmmGetPositionsOwnedRequest,
        response: {
          200: Type.Array(PositionInfoSchema),
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

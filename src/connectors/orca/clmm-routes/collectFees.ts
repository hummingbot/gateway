// TODO: This route needs complete rewrite for Orca SDK
// Need to use getCollectFeesV2Instruction() from @orca-so/whirlpools-client
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { OrcaClmmCollectFeesRequest } from '../schemas';

async function collectFees(
  fastify: FastifyInstance,
  _network: string,
  _address: string,
  _positionAddress: string,
): Promise<CollectFeesResponseType> {
  // Validate addresses
  try {
    new PublicKey(_positionAddress);
    new PublicKey(_address);
  } catch (error) {
    throw fastify.httpErrors.badRequest(`Invalid Solana address: ${_positionAddress}`);
  }

  // TODO: Implement using Orca SDK
  // Need to:
  // 1. Fetch position data using fetchPosition()
  // 2. Get whirlpool data using fetchWhirlpool()
  // 3. Build instruction using getCollectFeesV2Instruction()
  // 4. Create and send transaction
  throw fastify.httpErrors.notImplemented(
    'collectFees not yet implemented for Orca. This route requires getCollectFeesV2Instruction().',
  );
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress } = request.body;
        const network = request.body.network;

        return await collectFees(fastify, network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default collectFeesRoute;

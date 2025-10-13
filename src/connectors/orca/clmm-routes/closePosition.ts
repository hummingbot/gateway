// TODO: This route needs complete rewrite for Orca SDK
// Need to use getDecreaseLiquidityV2Instruction(), getCollectFeesV2Instruction(), and getClosePositionInstruction()
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { ClosePositionResponse, ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { OrcaClmmClosePositionRequest } from '../schemas';

async function closePosition(
  fastify: FastifyInstance,
  _network: string,
  _address: string,
  _positionAddress: string,
): Promise<ClosePositionResponseType> {
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
  // 2. Remove all liquidity using getDecreaseLiquidityV2Instruction() if needed
  // 3. Collect all fees using getCollectFeesV2Instruction()
  // 4. Close position using getClosePositionInstruction()
  // 5. Build transaction with all instructions
  // 6. Send transaction
  throw fastify.httpErrors.notImplemented(
    'closePosition not yet implemented for Orca. This route requires multiple Orca instructions.',
  );
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmClosePositionRequest>;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress } = request.body;
        const network = request.body.network;

        return await closePosition(fastify, network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default closePositionRoute;
